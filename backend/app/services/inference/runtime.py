"""
Shared plumbing for the detectors: CPU threads, "one heavy scan at a time", and the result cache.
"""
import hashlib
import json
import logging
import os
import threading
from typing import Optional

from ...config import settings

log = logging.getLogger("detectors")

# Bump this when the verdict logic changes, so old cached answers are not reused.
# "3": results can include a highlight picture (heatmap).
# "4": the explanation says "the detector" instead of "the main detector".
PIPELINE_VERSION = "5"

# The big model needs a lot of memory. Two scans at once on an 8 GB laptop would make
# everything crawl (or crash), so scans wait for their turn.
heavy_lock = threading.Lock()

_threads_done = False


def configure_threads() -> None:
    """Tells PyTorch to use the CPU cores (once)."""
    global _threads_done
    if _threads_done:
        return
    _threads_done = True
    try:
        import torch

        n = settings.cpu_threads or (os.cpu_count() or 4)
        torch.set_num_threads(max(1, int(n)))
        log.info("PyTorch will use %d CPU threads", torch.get_num_threads())
    except Exception as e:  # torch missing: nothing to configure
        log.warning("Could not set CPU threads: %s", e)


def onnx_threads() -> int:
    return int(settings.cpu_threads or (os.cpu_count() or 4))


# ---------- result cache ----------

def _settings_fingerprint() -> str:
    """Anything that can change a verdict. Changing a setting makes old cached answers unused."""
    parts = [
        PIPELINE_VERSION,
        str(settings.second_model_enabled),
        settings.second_model_revision,
        str(settings.second_model_float32),
        str(settings.face_models_enabled),
        str(settings.video_model_enabled),
        str(settings.video_frames),
        str(settings.commfor_enabled),
        str(settings.real_below),
        str(settings.ai_above),
    ]
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:12]


def _cache_path(kind: str, content: bytes) -> str:
    digest = hashlib.sha256(content).hexdigest()
    return os.path.join(settings.cache_dir, f"{kind}-{digest}-{_settings_fingerprint()}.json")


def cache_get(kind: str, content: bytes) -> Optional[dict]:
    if not settings.cache_enabled:
        return None
    try:
        path = _cache_path(kind, content)
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception as e:
        log.warning("Cache read failed: %s", e)
    return None


def cache_put(kind: str, content: bytes, result: dict) -> None:
    if not settings.cache_enabled:
        return
    try:
        os.makedirs(settings.cache_dir, exist_ok=True)
        path = _cache_path(kind, content)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(result, f)
        os.replace(tmp, path)
    except Exception as e:
        log.warning("Cache write failed: %s", e)