"""
Keeps backend/trust/anchors.pem up to date.

refresh_if_stale() is called in the background when the backend starts. It
downloads the public trust lists only if the file is missing or older than
MAX_AGE_DAYS, and it never replaces a working file with an empty one.
"""
import logging
import re
import threading
import time
import urllib.request
from pathlib import Path

logger = logging.getLogger("uvicorn")

TRUST_FILE = Path(__file__).resolve().parents[2] / "trust" / "anchors.pem"
MAX_AGE_DAYS = 14

SOURCES = [
    ("C2PA trust list",
     "https://raw.githubusercontent.com/c2pa-org/conformance-public/main/trust-list/C2PA-TRUST-LIST.pem"),
    ("Content Credentials interim trust list",
     "https://contentcredentials.org/trust/anchors.pem"),
]

_CERT_RE = re.compile(r"-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----", re.S)


def _download(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "deepfake-detector-fyp"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode("utf-8", errors="replace")


def is_stale(path: Path = None, max_age_days: int = MAX_AGE_DAYS) -> bool:
    path = path or TRUST_FILE
    if not path.exists():
        return True
    return (time.time() - path.stat().st_mtime) > max_age_days * 86400


def refresh(path: Path = None, sources=None, download=None) -> int:
    """Download and save the lists. Returns how many certificates were written (0 = kept old file)."""
    path = path or TRUST_FILE
    sources = sources or SOURCES
    download = download or _download

    certs = []
    for name, url in sources:
        try:
            found = _CERT_RE.findall(download(url))
            logger.info("trust list '%s': %d certificates", name, len(found))
            certs.extend(found)
        except Exception as e:
            logger.warning("trust list '%s' could not be downloaded: %s", name, e)

    certs = list(dict.fromkeys(certs))
    if not certs:
        return 0

    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text("\n".join(certs) + "\n", encoding="utf-8")
    tmp.replace(path)
    return len(certs)


def refresh_if_stale() -> None:
    try:
        if is_stale():
            n = refresh()
            if n:
                logger.info("trust list refreshed (%d certificates)", n)
            else:
                logger.info("trust list not refreshed, keeping existing file")
    except Exception as e:
        logger.warning("trust list refresh failed: %s", e)


def refresh_in_background() -> None:
    threading.Thread(target=refresh_if_stale, name="trust-list-refresh", daemon=True).start()