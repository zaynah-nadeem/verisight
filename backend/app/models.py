"""
Database tables: users, scans, a counter for guest scans, password-reset codes,
and reports of wrong results.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Float, Integer, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship

from .database import Base


def gen_uuid():
    return str(uuid.uuid4())


def utcnow():
    # naive UTC time (what SQLite stores)
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=gen_uuid)
    name = Column(String, nullable=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=utcnow)

    scans = relationship("Scan", back_populates="user", cascade="all, delete-orphan")
    resets = relationship("PasswordReset", back_populates="user", cascade="all, delete-orphan")


class Scan(Base):
    __tablename__ = "scans"

    id = Column(String, primary_key=True, default=gen_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)

    file_type = Column(String, nullable=False)       # image | video | audio
    file_name = Column(String, nullable=True)         # the name the user's file had
    verdict = Column(String, nullable=False)          # likely_authentic | ai_generated | inconclusive
    confidence_low = Column(Float, nullable=False)
    confidence_high = Column(Float, nullable=False)

    c2pa_status = Column(String, nullable=False)      # valid | unverified | invalid | absent
    c2pa_detail = Column(Text, nullable=True)

    # the full answer exactly as the app received it, so old scans look the same later
    result_json = Column(Text, nullable=False)

    image_path = Column(String, nullable=True)        # saved copy of the file
    created_at = Column(DateTime, default=utcnow, index=True)

    user = relationship("User", back_populates="scans")


class PasswordReset(Base):
    """A 6-digit code sent by e-mail so someone can choose a new password.
    Only a hash of the code is stored, and the row is deleted once the code is used."""
    __tablename__ = "password_resets"

    id = Column(String, primary_key=True, default=gen_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    code_hash = Column(String, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    attempts = Column(Integer, nullable=False, default=0)   # wrong guesses so far
    created_at = Column(DateTime, default=utcnow, index=True)

    user = relationship("User", back_populates="resets")


class GuestUsage(Base):
    """How many free scans each phone (device id) has used. No files or results are kept."""
    __tablename__ = "guest_usage"

    device_id = Column(String, primary_key=True)
    scans_used = Column(Integer, nullable=False, default=0)
    first_seen = Column(DateTime, default=utcnow)
    last_seen = Column(DateTime, default=utcnow)


class ResultReport(Base):
    """Someone saying "this result was wrong", and what the file really is.
    Kept so the detector can be checked and improved later.
    user_id and scan_id are plain text, not links, so deleting a scan or an account
    is never blocked by a report."""
    __tablename__ = "result_reports"

    id = Column(String, primary_key=True, default=gen_uuid)
    user_id = Column(String, nullable=True, index=True)      # signed-in person (empty for a guest)
    device_id = Column(String, nullable=True, index=True)    # the phone (for guests)
    scan_id = Column(String, nullable=True, index=True)

    file_type = Column(String, nullable=False)               # image | video
    file_name = Column(String, nullable=True)
    app_verdict = Column(String, nullable=True)              # what the app said
    confidence_low = Column(Float, nullable=True)
    confidence_high = Column(Float, nullable=True)
    actually_is = Column(String, nullable=False)             # real | ai_generated (what the person says)
    created_at = Column(DateTime, default=utcnow, index=True)