"""
C2PA content credentials check - kept SEPARATE from the model verdict.

Returns one of:
    - "valid"      -> credentials found, file matches them, signer trusted
    - "unverified" -> credentials found and file matches them, but the signer's
                      certificate could not be verified
    - "invalid"    -> credentials found but they no longer match the file
    - "absent"     -> no readable credentials on this file

If backend/trust/anchors.pem exists (made by fetch_trust_list.py) it is used as
the list of trusted signers, so images from Adobe, OpenAI, Google etc. can come
back as "valid" instead of "unverified".
"""
import json
import logging
import mimetypes
from pathlib import Path

from app.services import trust_list

logger = logging.getLogger("uvicorn")

try:
    from c2pa import Reader
    C2PA_AVAILABLE = True
except Exception as e:
    logger.warning("c2pa-python could not be imported: %s", e)
    C2PA_AVAILABLE = False

# backend/app/services/c2pa_service.py -> backend/trust/anchors.pem
TRUST_FILE = trust_list.TRUST_FILE

# keep the trust list fresh without slowing startup down
trust_list.refresh_in_background()


def _make_context():
    """A c2pa Context carrying our trust list, or None if not available."""
    try:
        if not TRUST_FILE.exists():
            return None
        from c2pa import Settings, Context
        pem = TRUST_FILE.read_text(encoding="utf-8")
        settings = Settings.from_dict({
            "trust": {"trust_anchors": pem},
            "verify": {"verify_trust": True},
        })
        return Context(settings=settings)
    except Exception as e:
        logger.warning("Could not load the C2PA trust list: %s: %s", type(e).__name__, e)
        return None


def _read_manifest_json(file_path: str) -> str:
    ctx = _make_context()
    if ctx is not None:
        mime = mimetypes.guess_type(file_path)[0] or "image/jpeg"
        try:
            with open(file_path, "rb") as f:
                return Reader(mime, f, context=ctx).json()
        except Exception as e:
            logger.warning("c2pa read with trust list failed (%s: %s), retrying without it",
                           type(e).__name__, e)
    # fallback: no trust list (older API styles supported too)
    reader = Reader.from_file(file_path) if hasattr(Reader, "from_file") else Reader(file_path)
    return reader.json()


def _result(status, detail, tool="", signer="", actions=None, ai_generated=False,
            trusted=False, codes=None):
    """Every result has the same shape, so the app can rely on every field."""
    return {
        "status": status,
        "detail": detail,
        "tool": tool or None,
        "signer": signer or None,
        "actions": actions or [],
        "ai_generated": bool(ai_generated),
        "trusted": bool(trusted),
        "codes": codes or [],
    }


def _absent(detail="No content credentials could be read from this file"):
    return _result("absent", detail)


def _is_signer_issue(code: str) -> bool:
    c = code.lower()
    return c.startswith("signingcredential.") or c.endswith(".untrusted")


def _is_only_untrusted(code: str) -> bool:
    return code.lower().endswith(".untrusted")


def _made_with(active: dict) -> str:
    info = active.get("claim_generator_info")
    if isinstance(info, list) and info and isinstance(info[0], dict) and info[0].get("name"):
        return str(info[0]["name"])
    generator = active.get("claim_generator")
    if isinstance(generator, str) and generator:
        return generator.split("/")[0]
    return ""


ACTION_NAMES = {
    "c2pa.created": "Created",
    "c2pa.converted": "Format converted",
    "c2pa.edited": "Edited",
    "c2pa.opened": "Opened",
    "c2pa.placed": "Content added",
    "c2pa.cropped": "Cropped",
    "c2pa.resized": "Resized",
    "c2pa.filtered": "Filter applied",
    "c2pa.color_adjustments": "Colors adjusted",
    "c2pa.drawing": "Drawing added",
    "c2pa.transcoded": "Format converted",
    "c2pa.published": "Published",
    "c2pa.repackaged": "Repackaged",
    "c2pa.watermarked.unbound": "Watermark added",
    "c2pa.watermarked.bound": "Watermark added",
}

AI_SOURCE_TYPES = ("trainedalgorithmicmedia", "compositewithtrainedalgorithmicmedia",
                   "algorithmicmedia")


def _actions(active: dict):
    """Returns (list of readable action names, whether it is marked AI-generated)."""
    names, ai = [], False
    for a in active.get("assertions") or []:
        if not isinstance(a, dict) or not str(a.get("label", "")).startswith("c2pa.actions"):
            continue
        for act in (a.get("data") or {}).get("actions") or []:
            if not isinstance(act, dict):
                continue
            code = str(act.get("action", ""))
            name = ACTION_NAMES.get(code) or code.replace("c2pa.", "").replace("_", " ").capitalize()
            if name and name not in names:
                names.append(name)
            src = str(act.get("digitalSourceType", "")).lower()
            if any(src.endswith(t) for t in AI_SOURCE_TYPES):
                ai = True
    return names, ai


def check_c2pa(file_path: str) -> dict:
    if not C2PA_AVAILABLE:
        return _absent("The C2PA check is not available on this setup")

    try:
        raw = _read_manifest_json(file_path)
    except Exception as e:
        logger.warning("c2pa read failed for %s: %s: %s", file_path, type(e).__name__, e)
        return _absent()

    try:
        data = json.loads(raw) if raw else {}
    except Exception:
        data = {}

    manifests = data.get("manifests") or {}
    if not manifests:
        return _absent("No C2PA manifest found on this file")

    failures = data.get("validation_status") or []
    codes = [str(f.get("code", "")) for f in failures if isinstance(f, dict)]
    integrity = [c for c in codes if not _is_signer_issue(c)]
    signer = [c for c in codes if _is_signer_issue(c)]
    signer_hard = [c for c in signer if not _is_only_untrusted(c)]

    active = manifests.get(data.get("active_manifest"), {}) or {}
    issuer = (active.get("signature_info") or {}).get("issuer")
    tool = _made_with(active)

    action_names, marked_ai = _actions(active)
    fields = dict(tool=tool, signer=issuer or "", actions=action_names,
                  ai_generated=marked_ai, codes=codes)

    extras = ""
    if tool:
        extras += f" Made with {tool}."
    if issuer:
        extras += f" Signed by {issuer}."
    if marked_ai:
        extras += "\nThe credentials say this was generated with an AI tool."
    if action_names:
        extras += "\nHistory: " + ", ".join(action_names) + "."

    logger.info("c2pa codes for %s: %s", file_path, codes)

    if integrity:
        shown = ", ".join(integrity[:3])
        return _result(
            "invalid",
            f"Content credentials found, but they no longer match the file ({shown}).{extras}",
            **fields,
        )

    if signer_hard:
        shown = ", ".join(signer_hard[:3])
        return _result(
            "unverified",
            "Content credentials found and the file matches them, but the signer's "
            f"certificate could not be verified ({shown}).{extras}",
            **fields,
        )

    detail = "Content credentials found and the signature checks out."
    if signer:
        detail += " The signer isn't on a trusted list."
    detail += extras
    return _result("valid", detail, trusted=not signer, **fields)