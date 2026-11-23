"""
Your own video model: an EfficientNet-B4 trained on frames of Celeb-DF v2.

In the training notebook the frames were whole frames (no face crop), saved as JPEG (quality 85),
resized to 224x224 and normalised with the ImageNet values. This file does the same, and a video's
score is the average over its frames, as in the notebook. It is only a small extra vote:
the notebook's own test gave 73% accuracy per video and caught real videos only about half the time.

File expected in the models folder: video_model_final.pt (or video_model_best.pt)
"""
import logging
import os
from typing import List

import numpy as np

from ...config import settings
from . import runtime

log = logging.getLogger("detectors")

_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

_instance = None


def _build_model(model_name: str):
    import timm
    import torch.nn as nn

    class VideoDeepfakeClassifier(nn.Module):
        def __init__(self):
            super().__init__()
            self.model_name = model_name
            self.backbone = timm.create_model(model_name, pretrained=False, num_classes=0)
            feat = self.backbone.num_features
            self.classifier = nn.Sequential(
                nn.Dropout(p=0.4),
                nn.Linear(feat, 256),
                nn.ReLU(inplace=True),
                nn.Dropout(p=0.3),
                nn.Linear(256, 1),
            )

        def forward(self, x):
            return self.classifier(self.backbone(x)).squeeze(1)

    return VideoDeepfakeClassifier()


def _find_weights(models_dir: str) -> str:
    for name in ("video_model_final.pt", "video_model_best.pt"):
        path = os.path.join(models_dir, name)
        if os.path.exists(path):
            return path
    raise FileNotFoundError(f"video_model_final.pt not found in '{models_dir}'.")


def _numpy_safe_types() -> list:
    """The few NumPy types that can appear in a checkpoint's saved test results."""
    import numpy as np

    types = []
    for module_name in ("numpy._core.multiarray", "numpy.core.multiarray"):
        try:
            types.append(__import__(module_name, fromlist=["scalar"]).scalar)
            break
        except Exception:
            pass
    types.append(np.dtype)
    for name in ("Float64DType", "Float32DType", "Int64DType", "Int32DType"):
        t = getattr(getattr(np, "dtypes", None), name, None)
        if t is not None:
            types.append(t)
    return types


def _load_checkpoint(path: str):
    """
    Loads the .pt file as safely as possible.
    Your checkpoint also stores a few NumPy numbers (the test accuracy results), which PyTorch's
    safest loader refuses by default. So: 1) safest loader, 2) safest loader plus an allow-list for
    those NumPy numbers, 3) only if both fail, the normal loader. The file is the one you trained
    and placed in your own models folder.
    """
    import torch

    try:
        return torch.load(path, map_location="cpu", weights_only=True)
    except Exception:
        pass
    try:
        with torch.serialization.safe_globals(_numpy_safe_types()):
            return torch.load(path, map_location="cpu", weights_only=True)
    except Exception as e:
        log.warning("Safe loading of %s failed (%s); using the normal loader for your own file.",
                    os.path.basename(path), type(e).__name__)
    return torch.load(path, map_location="cpu", weights_only=False)


class VideoModel:
    def __init__(self, models_dir: str):
        runtime.configure_threads()

        path = _find_weights(models_dir)
        checkpoint = _load_checkpoint(path)
        if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
            state = checkpoint["model_state_dict"]
            name = checkpoint.get("model_name", "efficientnet_b4")
            self.face_size = int(checkpoint.get("face_size", 224))
        else:  # video_model_best.pt is a plain state dict
            state, name, self.face_size = checkpoint, "efficientnet_b4", 224

        model = _build_model(name)
        model.load_state_dict(state, strict=True)  # strict: a half-loaded model would give nonsense
        self.model = model.eval()
        log.info("Video model ready (%s, %d px).", name, self.face_size)

    def _prepare(self, frame_rgb: np.ndarray) -> np.ndarray:
        import cv2

        # the training frames were JPEG files (quality 85), so do the same round trip here
        ok, buf = cv2.imencode(".jpg", cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 85])
        if ok:
            frame_rgb = cv2.cvtColor(cv2.imdecode(buf, cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB)
        img = cv2.resize(frame_rgb, (self.face_size, self.face_size), interpolation=cv2.INTER_LINEAR)
        img = (img.astype(np.float32) / 255.0 - _MEAN) / _STD
        return np.transpose(img, (2, 0, 1))

    def predict(self, frames_rgb: List[np.ndarray], batch_size: int = 4) -> List[float]:
        """Probability (0..1) that each frame is fake."""
        import torch

        out: List[float] = []
        with torch.inference_mode():
            for i in range(0, len(frames_rgb), batch_size):
                chunk = frames_rgb[i:i + batch_size]
                batch = torch.from_numpy(np.stack([self._prepare(f) for f in chunk]))
                out.extend(torch.sigmoid(self.model(batch)).float().cpu().tolist())
        return out


def get_video_model() -> VideoModel:
    global _instance
    if _instance is None:
        _instance = VideoModel(settings.models_dir)
    return _instance