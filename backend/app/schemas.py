"""
Pydantic request/response models.
"""
import re
from typing import Optional

from pydantic import BaseModel, Field, field_validator

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ---------- scanning ----------

class VerdictResult(BaseModel):
    verdict: str
    confidence_low: float
    confidence_high: float
    explanation: list[str] = []
    heatmap: Optional[str] = None           # see-through highlight picture (data link), images only
    heatmap_aspect: Optional[float] = None  # its width divided by its height


class C2PAResult(BaseModel):
    status: str                      # valid | unverified | invalid | absent
    detail: Optional[str] = None     # one-paragraph text version
    tool: Optional[str] = None       # e.g. "OpenAI Media Service API"
    signer: Optional[str] = None     # e.g. "OpenAI OpCo, LLC"
    actions: list[str] = []          # e.g. ["Created", "Format converted"]
    ai_generated: bool = False       # credentials say an AI tool made it
    trusted: bool = False            # signer is on our trusted list
    codes: list[str] = []            # technical validation codes


class DetectResponse(BaseModel):
    file_type: str
    verdict: VerdictResult
    c2pa: C2PAResult
    disclaimer: str = "This is a probability estimate, not proof. Always verify important claims through additional sources."
    scan_id: Optional[str] = None    # set when the scan was saved to an account


# ---------- accounts ----------

def _clean_email(value: str) -> str:
    value = (value or "").strip().lower()
    if not _EMAIL_RE.match(value) or len(value) > 254:
        raise ValueError("Enter a valid email address")
    return value


class SignupRequest(BaseModel):
    name: str = Field(default="", max_length=80)
    email: str
    # bcrypt only reads the first 72 bytes, so we cap the length
    password: str = Field(min_length=8, max_length=72)

    _email = field_validator("email")(_clean_email)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v):
        return (v or "").strip()


class LoginRequest(BaseModel):
    email: str
    password: str = Field(max_length=72)

    _email = field_validator("email")(_clean_email)


class ForgotPasswordRequest(BaseModel):
    email: str

    _email = field_validator("email")(_clean_email)


class ResetPasswordRequest(BaseModel):
    email: str
    code: str = Field(min_length=6, max_length=6, pattern=r"^[0-9]{6}$")
    new_password: str = Field(min_length=8, max_length=72)

    _email = field_validator("email")(_clean_email)


class MessageOut(BaseModel):
    message: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str = ""
    created_at: Optional[str] = None   # ISO time in UTC, ends with Z


class UpdateProfileRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v):
        v = (v or "").strip()
        if not v:
            raise ValueError("Enter a name")
        return v


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(max_length=72)
    new_password: str = Field(min_length=8, max_length=72)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- saved scans ----------

class ScanOut(BaseModel):
    id: str
    file_type: str
    file_name: Optional[str] = None
    created_at: str                  # ISO time in UTC, ends with Z
    has_file: bool = False
    result: DetectResponse


class GuestUsageOut(BaseModel):
    used: int
    limit: int
    remaining: int