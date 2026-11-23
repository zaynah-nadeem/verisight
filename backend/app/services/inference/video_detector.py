"""
Video check.

A few frames are taken evenly from the video and each one is scored like a photo by the main
detector; the video's score is the average. Your own video model gives a supporting vote, which can
turn "likely authentic" into "inconclusive" but cannot call a video fake alone.

Video checks are less reliable than image checks (this is true for every free detector right now,
and the answer says so).
"""
import logging
import os
from typing import List, Optional

import numpy as np
from PIL import Image

from ...config import settings
from . import runtime, verdict as V
from .image_detector import c2pa_result, c2pa_says_ai
from .media import sample_video_frames, save_png_temp

log = logging.getLogger("detectors")

VIDEO_SPREAD = 0.15  # wider than for images: video checks are less certain


def _score_frames_main(frames: List[np.ndarray]):
    """Returns (list of per-frame scores or None, which detector)."""
    if settings.second_model_enabled:
        try:
            from .second_model import get_second_model

            model = get_second_model()
            scores = []
            for i, frame in enumerate(frames, 1):
                path = save_png_temp(Image.fromarray(frame))
                try:
                    scores.append(model.predict_path(path))
                finally:
                    if os.path.exists(path):
                        os.remove(path)
                log.info("Video frame %d/%d scored %.3f", i, len(frames), scores[-1])
            return scores, "main"
        except Exception:
            log.exception("The main detector failed on a video")

    if settings.commfor_enabled:
        try:
            from .commfor import get_detector

            return get_detector().predict([Image.fromarray(f) for f in frames]), "commfor"
        except Exception:
            log.exception("Community Forensics failed on a video")

    return None, "none"


def _video_model_vote(frames: List[np.ndarray]) -> Optional[float]:
    if not settings.video_model_enabled:
        return None
    try:
        from .video_model import get_video_model

        scores = get_video_model().predict(frames)
        return float(np.mean(scores)) if scores else None
    except Exception:
        log.exception("The video model failed")
        return None


def _combine(scores: Optional[List[float]], source: str, vote: Optional[float]) -> Optional[dict]:
    if not scores:
        return None

    mean = float(np.mean(scores))
    flagged = sum(1 for s in scores if s >= settings.ai_above)
    verdict = V.band(mean)
    low, high = V.pct_range(mean, VIDEO_SPREAD)

    # the person sees one detector; the supporting video model only works in the background
    reasons = [
        f"The detector checked {len(scores)} frames of the video and averaged them: {V.pct(mean)} likely to be AI-generated.",
        f"{flagged} of {len(scores)} frames looked AI-generated on their own.",
    ]
    if vote is not None:
        if verdict == V.LIKELY_AUTHENTIC and V.support_alarm(vote):
            verdict = V.INCONCLUSIVE
            reasons.append("The frames and the video as a whole did not agree, so we cannot call this video authentic.")

    if verdict == V.INCONCLUSIVE:
        reasons.append("The score is in the uncertain zone, so we cannot say either way.")
    elif verdict == V.LIKELY_AUTHENTIC:
        reasons.append("No sign of AI generation was found in the frames we checked, but newer AI video tools can slip through.")
    else:
        reasons.append("This is an estimate, not proof.")
    reasons.append("Video results are less reliable than image results, because only a few frames are checked.")

    return {"verdict": verdict, "confidence_low": low, "confidence_high": high, "explanation": reasons}


def run_video_detection(content: bytes, suffix: str = ".mp4", c2pa: Optional[dict] = None) -> dict:
    if c2pa_says_ai(c2pa):
        return c2pa_result(c2pa, "video")

    cached = runtime.cache_get("video", content)
    if cached:
        return cached

    frames = sample_video_frames(content, suffix, settings.video_frames)  # raises UnreadableMedia

    with runtime.heavy_lock:
        scores, source = _score_frames_main(frames)
        vote = _video_model_vote(frames)

    result = _combine(scores, source, vote)
    if result is None:
        reasons = ["No detection model could be used for this scan, so there is no result."]
        if vote is not None:
            reasons = [
                "The detector could not fully run on this video, so we only have a rough estimate, which is too unreliable to decide alone.",
                f"The rough estimate says {V.pct(vote)} likely AI-generated.",
            ]
        return {
            "verdict": V.INCONCLUSIVE,
            "confidence_low": 0.0,
            "confidence_high": 100.0,
            "explanation": reasons,
        }

    runtime.cache_put("video", content, result)
    return result