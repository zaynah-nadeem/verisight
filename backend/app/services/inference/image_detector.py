"""
Image check.

Order of work:
  1. If the file's content credentials (C2PA) say an AI tool made it, we are done at once.
  2. If we have seen this exact file before, return the remembered answer.
  3. The main detector (SigLIP2 + DINOv2) scores the whole picture.
  4. If a face is found, your own face models give a supporting vote.
     They can turn "likely authentic" into "inconclusive", but they cannot call a picture fake alone.
"""
import logging
import os
from typing import Optional

import numpy as np

from ...config import settings
from . import runtime, verdict as V
from .media import open_image, save_png_temp
from .heatmap import make_overlay

log = logging.getLogger("detectors")

IMAGE_SPREAD = 0.10  # +/- 10 points around the score is shown as the likelihood range


def c2pa_says_ai(c2pa: Optional[dict]) -> bool:
    return bool(c2pa) and bool(c2pa.get("ai_generated")) and c2pa.get("status") in ("valid", "unverified")


def c2pa_result(c2pa: dict, noun: str = "image") -> dict:
    tool = c2pa.get("tool")
    reasons = [f"The {noun}'s content credentials say it was generated with an AI tool"
               + (f" ({tool})." if tool else ".")]
    if c2pa.get("status") == "unverified":
        reasons.append("The signer's certificate could not be verified, but the file matches its credentials.")
    reasons.append("We did not need to run the detection models for this result.")
    return {
        "verdict": V.AI_GENERATED,
        "confidence_low": 95.0,
        "confidence_high": 99.0,
        "explanation": reasons,
    }


def _main_score(img):
    """Returns (score 0..1 or None, which detector gave it)."""
    if settings.second_model_enabled:
        path = None
        try:
            from .second_model import get_second_model

            model = get_second_model()
            path = save_png_temp(img)
            return model.predict_path(path), "main"
        except Exception:
            log.exception("The main detector failed")
        finally:
            if path and os.path.exists(path):
                os.remove(path)

    if settings.commfor_enabled:
        try:
            from .commfor import get_detector

            return get_detector().predict([img])[0], "commfor"
        except Exception:
            log.exception("Community Forensics failed")

    return None, "none"


def _main_score_with_map(img):
    """
    Like _main_score, but the main detector also makes a highlight grid in the same pass
    (this costs almost no extra time). Returns (score, source, grid or None).
    """
    if not settings.second_model_enabled:
        score, source = _main_score(img)
        return score, source, None

    path = None
    try:
        from .second_model import get_second_model

        model = get_second_model()
        path = save_png_temp(img)
        score, grid = model.predict_with_map(path)
        return score, "main", grid
    except Exception:
        log.exception("The main detector failed")
    finally:
        if path and os.path.exists(path):
            os.remove(path)

    # the main detector failed: do not try it twice, go straight to the quick-check model
    if settings.commfor_enabled:
        try:
            from .commfor import get_detector

            return get_detector().predict([img])[0], "commfor", None
        except Exception:
            log.exception("Community Forensics failed")
    return None, "none", None


def _turn_needed(content: bytes, img) -> Optional[int]:
    """
    Phones store portrait photos sideways plus an "orientation" note. If the picture we scored is
    still sideways, the highlight picture must be turned the same way the phone turns it.
    Returns that note, or None when nothing needs turning.
    """
    try:
        import io

        from PIL import Image

        raw = Image.open(io.BytesIO(content))
        orientation = raw.getexif().get(0x0112, 1)
        if orientation in (5, 6, 7, 8):
            raw_landscape = raw.size[0] >= raw.size[1]
            seen_landscape = img.size[0] >= img.size[1]
            if raw_landscape == seen_landscape:  # we looked at it unturned
                return orientation
    except Exception:
        pass
    return None


def _face_vote(img) -> Optional[dict]:
    if not settings.face_models_enabled:
        return None
    try:
        from .face_ensemble import find_face, get_face_ensemble

        face = find_face(np.asarray(img))
        if face is None:
            return {"found": False}
        return {"found": True, **get_face_ensemble().predict(face)}
    except Exception:
        log.exception("The face models failed")
        return None


def _combine(score: Optional[float], source: str, face: Optional[dict], heat=None) -> Optional[dict]:
    if score is None:
        return None

    verdict = V.band(score)
    low, high = V.pct_range(score, IMAGE_SPREAD)
    name = "The detector"
    reasons = [f"{name} rates this image {V.pct(score)} likely to be AI-generated."]

    q = face.get("ensemble") if face and face.get("found") else None
    if q is not None:
        reasons.append(f"A face was found, so our own face models also checked it: {V.pct(q)} likely fake.")
        if verdict == V.LIKELY_AUTHENTIC and V.support_alarm(q):
            verdict = V.INCONCLUSIVE
            reasons.append("The face models disagree with the detector, so we cannot call this image authentic.")
        elif verdict == V.AI_GENERATED and q < 0.5:
            reasons.append("The face models did not flag it. They were trained on older fakes, so that counts for little.")

    if verdict == V.INCONCLUSIVE:
        reasons.append("The score is in the uncertain zone, so we cannot say either way.")
    elif verdict == V.LIKELY_AUTHENTIC:
        reasons.append("No sign of AI generation was found, but detectors can miss new AI tools and AI edits to real photos.")
    else:
        reasons.append("This is an estimate, not proof.")

    result = {"verdict": verdict, "confidence_low": low, "confidence_high": high, "explanation": reasons}
    if heat:
        # heat = (picture as a data link, width-to-height ratio)
        result["heatmap"], result["heatmap_aspect"] = heat
    return result


def run_image_detection(content: bytes, c2pa: Optional[dict] = None) -> dict:
    # 1) credentials that say "AI-generated" settle it without any model
    if c2pa_says_ai(c2pa):
        return c2pa_result(c2pa, "image")

    # 2) seen before?
    cached = runtime.cache_get("image", content)
    if cached:
        return cached

    img = open_image(content)  # raises UnreadableMedia for non-images

    # 3) + 4) the models. One scan at a time: the big model needs most of the memory.
    with runtime.heavy_lock:
        score, source, grid = _main_score_with_map(img)
        face = _face_vote(img)

    # the highlight is only shown when there is something to point at (not for clearly real photos)
    heat = None
    if grid is not None and score is not None and score >= settings.real_below:
        try:
            heat = make_overlay(grid, img.size, _turn_needed(content, img))
        except Exception:
            log.exception("Could not draw the highlight")

    result = _combine(score, source, face, heat)
    if result is None:
        # nothing could score the picture: say so honestly, and do not remember this answer
        return {
            "verdict": V.INCONCLUSIVE,
            "confidence_low": 0.0,
            "confidence_high": 100.0,
            "explanation": ["No detection model could be used for this scan, so there is no result."],
        }

    runtime.cache_put("image", content, result)
    return result