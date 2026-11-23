"""
A signed-in user's saved scans. Everything here is owner-only.
"""
import mimetypes
import os

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Scan, User
from ..schemas import DetectResponse, ScanOut

router = APIRouter(prefix="/scans", tags=["scans"])


def scan_to_out(scan: Scan) -> ScanOut:
    result = DetectResponse.model_validate_json(scan.result_json)
    result.scan_id = scan.id
    return ScanOut(
        id=scan.id,
        file_type=scan.file_type,
        file_name=scan.file_name,
        created_at=scan.created_at.isoformat() + "Z",
        has_file=bool(scan.image_path and os.path.exists(scan.image_path)),
        result=result,
    )


def _own_scan(db: Session, user: User, scan_id: str) -> Scan:
    scan = db.scalar(select(Scan).where(Scan.id == scan_id, Scan.user_id == user.id))
    if scan is None:  # same answer for "doesn't exist" and "not yours"
        raise HTTPException(status_code=404, detail="Scan not found.")
    return scan


def _remove_file(path):
    try:
        if path and os.path.exists(path):
            os.remove(path)
    except OSError:
        pass


@router.get("", response_model=list[ScanOut])
def list_scans(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.scalars(
        select(Scan)
        .where(Scan.user_id == user.id)
        .order_by(Scan.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return [scan_to_out(s) for s in rows]


@router.get("/{scan_id}", response_model=ScanOut)
def get_scan(scan_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return scan_to_out(_own_scan(db, user, scan_id))


@router.get("/{scan_id}/file")
def get_scan_file(scan_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    scan = _own_scan(db, user, scan_id)
    if not scan.image_path or not os.path.exists(scan.image_path):
        raise HTTPException(status_code=404, detail="The file for this scan is no longer stored.")
    media_type = mimetypes.guess_type(scan.image_path)[0] or "application/octet-stream"
    return FileResponse(scan.image_path, media_type=media_type)


@router.delete("/{scan_id}", status_code=204)
def delete_scan(scan_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    scan = _own_scan(db, user, scan_id)
    _remove_file(scan.image_path)
    db.delete(scan)
    db.commit()


@router.delete("", status_code=204)
def clear_scans(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    for path in db.scalars(select(Scan.image_path).where(Scan.user_id == user.id)).all():
        _remove_file(path)
    db.execute(delete(Scan).where(Scan.user_id == user.id))
    db.commit()