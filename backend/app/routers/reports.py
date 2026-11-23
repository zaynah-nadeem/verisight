"""
"Report wrong result": a person says what a file really is, so we can see where the detector
gets things wrong. Works for signed-in people and for guests.
"""
import re
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_optional_user
from ..models import ResultReport, User
from ..schemas import MessageOut

router = APIRouter(prefix="/reports", tags=["reports"])

_DEVICE_ID_RE = re.compile(r"^[A-Za-z0-9._-]{8,64}$")
MAX_REPORTS_PER_PERSON = 500


class ReportIn(BaseModel):
    scan_id: Optional[str] = Field(default=None, max_length=64)
    file_type: Literal["image", "video"] = "image"
    file_name: Optional[str] = Field(default=None, max_length=255)
    app_verdict: Optional[str] = Field(default=None, max_length=40)
    confidence_low: Optional[float] = Field(default=None, ge=0, le=100)
    confidence_high: Optional[float] = Field(default=None, ge=0, le=100)
    actually_is: Literal["real", "ai_generated"]


@router.post("", response_model=MessageOut, status_code=201)
def create_report(
    body: ReportIn,
    x_device_id: Optional[str] = Header(default=None),
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    # who is reporting: a signed-in person, or a guest phone
    if user is not None:
        owner = ResultReport.user_id == user.id
        user_id, device_id = user.id, None
    else:
        if not x_device_id or not _DEVICE_ID_RE.match(x_device_id):
            raise HTTPException(status_code=400, detail="A valid X-Device-Id header is required when not signed in.")
        owner = ResultReport.device_id == x_device_id
        user_id, device_id = None, x_device_id

    # the same scan reported again: update the answer instead of adding a copy
    if body.scan_id:
        existing = db.scalar(select(ResultReport).where(owner, ResultReport.scan_id == body.scan_id))
        if existing is not None:
            existing.actually_is = body.actually_is
            db.commit()
            return MessageOut(message="Thank you. Your report was saved.")

    count = db.scalar(select(func.count()).select_from(ResultReport).where(owner)) or 0
    if count >= MAX_REPORTS_PER_PERSON:
        raise HTTPException(status_code=429, detail="You have sent a lot of reports. Thank you, that's enough for now.")

    db.add(
        ResultReport(
            user_id=user_id,
            device_id=device_id,
            scan_id=body.scan_id,
            file_type=body.file_type,
            file_name=body.file_name,
            app_verdict=body.app_verdict,
            confidence_low=body.confidence_low,
            confidence_high=body.confidence_high,
            actually_is=body.actually_is,
        )
    )
    db.commit()
    return MessageOut(message="Thank you. Your report was saved.")