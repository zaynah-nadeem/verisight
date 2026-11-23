"""
Sign up, sign in, 'who am I', forgot / reset password, and delete account.
"""
import os
import secrets
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..models import PasswordReset, Scan, User, utcnow
from ..schemas import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MessageOut,
    ResetPasswordRequest,
    SignupRequest,
    TokenResponse,
    UpdateProfileRequest,
    UserOut,
)
from ..security import DUMMY_HASH, create_access_token, hash_password, verify_password
from ..services.email_service import send_reset_code

router = APIRouter(prefix="/auth", tags=["auth"])

MAX_CODE_GUESSES = 5          # wrong tries before a code stops working
MIN_SECONDS_BETWEEN_CODES = 60
MAX_CODES_PER_HOUR = 5


def _user_out(user: User) -> UserOut:
    created = user.created_at.isoformat() + "Z" if user.created_at else None
    return UserOut(id=user.id, email=user.email, name=user.name or "", created_at=created)


def _token_response(user: User) -> TokenResponse:
    return TokenResponse(access_token=create_access_token(user.id), user=_user_out(user))


@router.post("/signup", response_model=TokenResponse, status_code=201)
def signup(body: SignupRequest, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    user = User(name=body.name, email=body.email, hashed_password=hash_password(body.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:  # two sign-ups at the same moment
        db.rollback()
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    db.refresh(user)
    return _token_response(user)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email))
    # same message for "no such email" and "wrong password", so emails can't be guessed
    ok = verify_password(body.password, user.hashed_password if user else DUMMY_HASH)
    if not user or not ok:
        raise HTTPException(status_code=401, detail="Wrong email or password.")
    return _token_response(user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return _user_out(user)


@router.patch("/me", response_model=UserOut)
def update_me(
    body: UpdateProfileRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Changes the display name."""
    user.name = body.name
    db.commit()
    db.refresh(user)
    return _user_out(user)


@router.post("/change-password", response_model=MessageOut)
def change_password(
    body: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Changes the password of the signed-in account. The current password is asked for again,
    so a stolen, unlocked phone can't take over the account with one tap."""
    if not verify_password(body.current_password, user.hashed_password):
        # 403, not 401: the login itself is fine, only this confirmation is wrong
        raise HTTPException(status_code=403, detail="Your current password is wrong.")
    if verify_password(body.new_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Choose a password that is different from the current one.")
    user.hashed_password = hash_password(body.new_password)
    # any reset code that was asked for earlier must not work any more
    db.execute(delete(PasswordReset).where(PasswordReset.user_id == user.id))
    db.commit()
    return MessageOut(message="Your password has been changed.")


# ---------- forgot / reset password ----------

# The same answer whether or not the e-mail has an account, so nobody can use this to find out
# who is registered.
_FORGOT_REPLY = "If an account exists for that e-mail, we have sent a 6-digit code to it."
_BAD_CODE = "That code is wrong or has expired. Check it, or ask for a new one."


@router.post("/forgot-password", response_model=MessageOut)
def forgot_password(body: ForgotPasswordRequest, background: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email))
    if user is None:
        return MessageOut(message=_FORGOT_REPLY)

    now = utcnow()
    recent = db.scalars(
        select(PasswordReset.created_at)
        .where(PasswordReset.user_id == user.id)
        .where(PasswordReset.created_at > now - timedelta(hours=1))
        .order_by(PasswordReset.created_at.desc())
    ).all()
    # Too many requests: quietly send nothing. (An error here would tell a stranger that the
    # account exists. The app has its own "wait before resending" timer.)
    if recent and (now - recent[0]).total_seconds() < MIN_SECONDS_BETWEEN_CODES:
        return MessageOut(message=_FORGOT_REPLY)
    if len(recent) >= MAX_CODES_PER_HOUR:
        return MessageOut(message=_FORGOT_REPLY)

    code = f"{secrets.randbelow(1_000_000):06d}"
    # Only the newest code works (the reset step looks at the newest one only). Older rows are
    # kept for an hour so the "5 codes per hour" limit can count them, then removed.
    db.execute(
        delete(PasswordReset)
        .where(PasswordReset.user_id == user.id)
        .where(PasswordReset.created_at <= now - timedelta(hours=1))
    )
    db.add(
        PasswordReset(
            user_id=user.id,
            code_hash=hash_password(code),
            expires_at=now + timedelta(minutes=settings.reset_code_minutes),
        )
    )
    db.commit()

    # sent after the answer is returned, so the app does not wait for the e-mail server
    background.add_task(send_reset_code, user.email, code)
    return MessageOut(message=_FORGOT_REPLY)


@router.post("/reset-password", response_model=MessageOut)
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email))
    reset = None
    if user is not None:
        reset = db.scalar(
            select(PasswordReset)
            .where(PasswordReset.user_id == user.id)
            .order_by(PasswordReset.created_at.desc())
        )

    if user is None or reset is None:
        verify_password(body.code, DUMMY_HASH)  # spend the same time as a real check
        raise HTTPException(status_code=400, detail=_BAD_CODE)

    if reset.expires_at < utcnow() or reset.attempts >= MAX_CODE_GUESSES:
        db.delete(reset)
        db.commit()
        raise HTTPException(status_code=400, detail=_BAD_CODE)

    if not verify_password(body.code, reset.code_hash):
        reset.attempts += 1
        db.commit()
        raise HTTPException(status_code=400, detail=_BAD_CODE)

    user.hashed_password = hash_password(body.new_password)
    db.execute(delete(PasswordReset).where(PasswordReset.user_id == user.id))
    db.commit()
    return MessageOut(message="Your password has been changed. You can sign in now.")


# ---------- delete account ----------

class DeleteAccountRequest(BaseModel):
    password: str


@router.post("/delete-account", status_code=204)
def delete_account(
    body: DeleteAccountRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Permanently deletes the signed-in account, all its saved scans and their stored files.
    The password is asked for again so a stolen phone can't wipe the account with one tap."""
    if not verify_password(body.password, user.hashed_password):
        # 403, not 401: the login itself is fine, only this confirmation is wrong
        raise HTTPException(status_code=403, detail="Wrong password.")

    for path in db.scalars(select(Scan.image_path).where(Scan.user_id == user.id)).all():
        try:
            if path and os.path.exists(path):
                os.remove(path)
        except OSError:
            pass
    db.execute(delete(Scan).where(Scan.user_id == user.id))
    db.delete(user)
    db.commit()