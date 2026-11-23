"""
Turns the small highlight grid from the main detector into a see-through picture
(a PNG with red glow where the detector found the strongest signs) that the app puts on top of the photo.
"""
import base64
import io

import numpy as np
from PIL import Image, ImageFilter

_T = getattr(Image, "Transpose", Image)  # works with old and new versions of Pillow

# What the phone's "orientation" tag means, as the turn needed to show the picture upright
_EXIF_TURN = {
    2: _T.FLIP_LEFT_RIGHT,
    3: _T.ROTATE_180,
    4: _T.FLIP_TOP_BOTTOM,
    5: _T.TRANSPOSE,
    6: _T.ROTATE_270,
    7: _T.TRANSVERSE,
    8: _T.ROTATE_90,
}

LONG_SIDE = 256  # the overlay is small on purpose: it is sent to the phone with every result


def make_overlay(grid, size, orientation=None):
    """
    grid: 2-D numpy array, values 0..1 (bigger = the score is more sensitive to that area)
    size: (width, height) of the picture the detector looked at
    orientation: the phone's orientation tag, if the overlay must be turned to match what the phone shows
    Returns (data_uri, width_to_height_ratio).
    """
    width, height = size
    scale = LONG_SIDE / float(max(width, height))
    ow, oh = max(1, round(width * scale)), max(1, round(height * scale))

    g = np.clip(np.asarray(grid, dtype="float32"), 0.0, 1.0)
    small = Image.fromarray((g * 255).astype("uint8"), "L")
    # smooth, so it looks like a glow and not like blocks
    smooth = small.resize((ow, oh), Image.BICUBIC).filter(ImageFilter.GaussianBlur(radius=max(3, LONG_SIDE // 40)))
    v = np.asarray(smooth, dtype="float32") / 255.0
    peak = float(v.max())
    if peak <= 0:
        raise ValueError("empty highlight map")
    v = v / peak  # the strongest area always reaches full strength

    # only the strongest part of the map is drawn, so the photo stays readable
    strength = np.clip((v - 0.45) / 0.55, 0.0, 1.0)
    rgba = np.zeros((oh, ow, 4), dtype="uint8")
    rgba[..., 0] = 255
    rgba[..., 1] = (200 * (1.0 - strength)).astype("uint8")  # yellow at the edges, red in the middle
    rgba[..., 2] = 30
    rgba[..., 3] = (215 * strength).astype("uint8")

    out = Image.fromarray(rgba, "RGBA")
    if orientation in _EXIF_TURN:
        out = out.transpose(_EXIF_TURN[orientation])

    buf = io.BytesIO()
    out.save(buf, format="PNG", optimize=True)
    uri = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    return uri, round(out.width / float(out.height), 4)