"""
Reading uploaded pictures and videos safely.
"""
import io
import logging
import os
import tempfile
from typing import List

import numpy as np
from PIL import Image, ImageOps

from ...config import settings

log = logging.getLogger("detectors")

# iPhone photos are usually HEIC. This lets Pillow open them (pip install pillow-heif).
try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
except Exception:  # the library is optional: without it, HEIC files are simply "unreadable"
    log.warning("pillow-heif is not installed, so HEIC photos cannot be read")


class UnreadableMedia(Exception):
    """The uploaded file is not a picture or video we can read."""


def open_image(content: bytes) -> Image.Image:
    """Bytes -> RGB picture, turned the right way up (phones store rotation in the file)."""
    try:
        img = Image.open(io.BytesIO(content))
        img.load()
        img = ImageOps.exif_transpose(img)
        return img.convert("RGB")
    except Exception as e:
        raise UnreadableMedia(f"Could not read this image ({type(e).__name__}).") from e


def shrink_for_model(img: Image.Image) -> Image.Image:
    """
    Phone photos are huge (12 to 48 megapixels) and heavily sharpened, which can make a real photo
    look "AI" to the detector. Shrinking the long side to MAIN_MAX_SIDE pixels (default 1024) first
    removes most of that. 0 turns it off.
    """
    limit = int(getattr(settings, "main_max_side", 0) or 0)
    if limit <= 0 or max(img.size) <= limit:
        return img
    k = limit / max(img.size)
    return img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), resample=Image.LANCZOS)


def save_png_temp(img: Image.Image) -> str:
    """Saves a picture as a lossless PNG in a temp file and returns its path (caller deletes it)."""
    fd, path = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    shrink_for_model(img).save(path, format="PNG")
    return path


def sample_video_frames(content: bytes, suffix: str, n_frames: int) -> List[np.ndarray]:
    """
    Returns n evenly spaced frames (RGB arrays). Frames are taken from the middle of n equal
    parts of the video, so a black first or last frame is not picked.
    """
    import cv2

    n_frames = max(1, int(n_frames))
    fd, path = tempfile.mkstemp(suffix=suffix or ".mp4")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(content)

        cap = cv2.VideoCapture(path)
        if not cap.isOpened():
            raise UnreadableMedia("Could not open this video.")
        try:
            total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            frames: List[np.ndarray] = []

            if total > 0:
                wanted = sorted({min(total - 1, int((i + 0.5) * total / n_frames)) for i in range(n_frames)})
                for idx in wanted:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
                    ok, frame = cap.read()
                    if ok and frame is not None:
                        frames.append(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))

            if not frames:
                # some files do not report their length or do not allow jumping: read them in order
                cap.release()
                cap = cv2.VideoCapture(path)
                every, read, kept = 15, 0, []
                while len(kept) < 300:
                    ok, frame = cap.read()
                    if not ok:
                        break
                    if read % every == 0:
                        kept.append(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                    read += 1
                if kept:
                    step = max(1, len(kept) // n_frames)
                    frames = kept[step // 2::step][:n_frames] or kept[:n_frames]
        finally:
            cap.release()

        if not frames:
            raise UnreadableMedia("Could not read any frames from this video.")
        return frames
    finally:
        try:
            os.remove(path)
        except OSError:
            pass