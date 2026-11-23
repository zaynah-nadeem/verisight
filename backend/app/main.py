import logging
import os
import re
import threading
import uuid
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .config import settings
from .database import Base, engine, get_db
from . import models  # noqa: F401  (makes sure the tables are known before create_all)
from .deps import get_optional_user
from .models import GuestUsage, Scan, User, utcnow
from .routers import auth, reports, scans
from .schemas import C2PAResult, DetectResponse, GuestUsageOut, VerdictResult
from .services.inference.image_detector import run_image_detection
from .services.inference.media import UnreadableMedia
from .services.inference.video_detector import run_video_detection
from .services.c2pa_service import check_c2pa
from .services.url_fetch import UrlFetchError, fetch_image

Base.metadata.create_all(bind=engine)

log = logging.getLogger("uvicorn")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # start loading the detectors in the background, so the first scan is not extra slow
    if settings.warmup_on_start:
        threading.Thread(target=_warm_up, name="warm-up", daemon=True).start()
    yield


app = FastAPI(title="Deepfake Detector API", lifespan=lifespan)
app.include_router(auth.router)
app.include_router(scans.router)
app.include_router(reports.router)

UPLOAD_DIR = settings.upload_dir
os.makedirs(UPLOAD_DIR, exist_ok=True)

_DEVICE_ID_RE = re.compile(r"^[A-Za-z0-9._-]{8,64}$")


# ---------- helpers ----------

def _save_upload(content: bytes, ext: str) -> str:
    path = os.path.join(UPLOAD_DIR, f"{uuid.uuid4()}{ext}")
    with open(path, "wb") as f:
        f.write(content)
    return path


def _clean_device_id(device_id: Optional[str]) -> str:
    if not device_id or not _DEVICE_ID_RE.match(device_id):
        raise HTTPException(status_code=400, detail="A valid X-Device-Id header is required when not signed in.")
    return device_id


def _guest_scans_used(db: Session, device_id: str) -> int:
    row = db.get(GuestUsage, device_id)
    return row.scans_used if row else 0


def _count_guest_scan(db: Session, device_id: str) -> None:
    row = db.get(GuestUsage, device_id)
    if row is None:
        row = GuestUsage(device_id=device_id, scans_used=0)
        db.add(row)
    row.scans_used += 1
    row.last_seen = utcnow()
    db.commit()


def _remove(path: str) -> None:
    try:
        os.remove(path)
    except OSError:
        pass


def _analyse(kind: str, content: bytes, ext: str, saved_path: str):
    """
    The slow part (the models). It runs in a worker thread so the server can still answer other
    requests, such as /health, while a scan is in progress.
    The content credentials are read first because the answer is instant, and when they say
    "AI-generated" the models do not need to run at all.
    """
    c2pa_result = check_c2pa(saved_path)
    if kind == "image":
        verdict_result = run_image_detection(content, c2pa=c2pa_result)
    else:
        verdict_result = run_video_detection(content, suffix=ext, c2pa=c2pa_result)
    return verdict_result, c2pa_result


async def _run_scan(
    kind: str,
    content: bytes,
    filename: str,
    default_ext: str,
    db: Session,
    user: Optional[User],
    device_id: Optional[str],
) -> DetectResponse:
    # 1) guests: check the free-scan limit BEFORE doing any work
    if user is None:
        device_id = _clean_device_id(device_id)
        if _guest_scans_used(db, device_id) >= settings.guest_scan_limit:
            raise HTTPException(status_code=403, detail="guest_limit_reached")

    ext = os.path.splitext(filename or "")[1] or default_ext
    saved_path = _save_upload(content, ext)
    try:
        try:
            verdict_result, c2pa_result = await run_in_threadpool(_analyse, kind, content, ext, saved_path)
        except UnreadableMedia as e:
            # a clear message for the app, and the free scan is not used up
            raise HTTPException(status_code=422, detail=f"We couldn't read this {kind}. {e}")

        response = DetectResponse(
            file_type=kind,
            verdict=VerdictResult(**verdict_result),
            c2pa=C2PAResult(**c2pa_result),
        )

        if user is not None:
            # signed in: keep the file and the full result in their account
            scan = Scan(
                user_id=user.id,
                file_type=kind,
                file_name=filename or None,
                verdict=response.verdict.verdict,
                confidence_low=response.verdict.confidence_low,
                confidence_high=response.verdict.confidence_high,
                c2pa_status=response.c2pa.status,
                c2pa_detail=response.c2pa.detail,
                result_json=response.model_dump_json(),
                image_path=saved_path,
            )
            db.add(scan)
            db.commit()
            response.scan_id = scan.id
        else:
            # guest: nothing is stored, only the counter goes up
            _count_guest_scan(db, device_id)
            _remove(saved_path)
        return response
    except Exception:
        # don't leave an orphaned file behind if anything failed
        _remove(saved_path)
        raise


def _warm_up() -> None:
    """Loads the big model in the background at start-up, so the first scan is not extra slow."""
    from .services.inference import runtime

    # holding the same lock as a scan means the model is never loaded twice at the same time
    with runtime.heavy_lock:
        for label, enabled, load in (
            ("main detector", settings.second_model_enabled, "second_model.get_second_model"),
            ("face models", settings.face_models_enabled, "face_ensemble.get_face_ensemble"),
            ("video model", settings.video_model_enabled, "video_model.get_video_model"),
        ):
            if not enabled:
                continue
            try:
                module_name, func_name = load.split(".")
                module = __import__(f"app.services.inference.{module_name}", fromlist=[func_name])
                getattr(module, func_name)()
                log.info("Loaded the %s.", label)
            except Exception as e:
                log.warning("Warm-up could not load the %s: %s: %s", label, type(e).__name__, e)
    log.info("Warm-up finished.")


# ---------- routes ----------

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/guest/usage", response_model=GuestUsageOut)
def guest_usage(x_device_id: Optional[str] = Header(default=None), db: Session = Depends(get_db)):
    device_id = _clean_device_id(x_device_id)
    used = _guest_scans_used(db, device_id)
    limit = settings.guest_scan_limit
    return GuestUsageOut(used=used, limit=limit, remaining=max(limit - used, 0))


@app.post("/detect/image", response_model=DetectResponse)
async def detect_image(
    file: UploadFile = File(...),
    x_device_id: Optional[str] = Header(default=None),
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    content = await file.read()
    return await _run_scan("image", content, file.filename or "", ".jpg", db, user, x_device_id)


class UrlScanRequest(BaseModel):
    url: str = Field(min_length=3, max_length=2048)


@app.post("/detect/url", response_model=DetectResponse)
async def detect_url(
    body: UrlScanRequest,
    x_device_id: Optional[str] = Header(default=None),
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    # guests: check the free-scan limit BEFORE downloading anything
    if user is None:
        device_id = _clean_device_id(x_device_id)
        if _guest_scans_used(db, device_id) >= settings.guest_scan_limit:
            raise HTTPException(status_code=403, detail="guest_limit_reached")

    try:
        fetched = await run_in_threadpool(fetch_image, body.url)
    except UrlFetchError as e:
        # a link problem is not a scan: the free scan is not used up
        raise HTTPException(status_code=422, detail=e.message)

    return await _run_scan("image", fetched.content, fetched.filename, fetched.ext, db, user, x_device_id)


@app.post("/detect/video", response_model=DetectResponse)
async def detect_video(
    file: UploadFile = File(...),
    x_device_id: Optional[str] = Header(default=None),
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    content = await file.read()
    return await _run_scan("video", content, file.filename or "", ".mp4", db, user, x_device_id)