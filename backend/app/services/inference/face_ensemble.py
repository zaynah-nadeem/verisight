"""
Your own image models (EfficientNet-B4 + Xception41 + ViT-Base), trained on the 140k real/fake
faces dataset. They only know faces, so they run on a face found inside the picture, and their
answer is only a supporting vote.

Files expected in the models folder (exported from your notebook):
    efficientnet_b4.onnx   xception41.onnx   vit_base_patch16_224.onnx
Each takes input "image" [N,3,224,224] and gives output "logit" (sigmoid -> probability of FAKE).
"""
import logging
import os
from typing import List, Optional, Tuple

import numpy as np

from ...config import settings
from . import runtime

log = logging.getLogger("detectors")

# same order and weights as the ensemble in the training notebook
MODEL_FILES = [
    ("efficientnet_b4", "efficientnet_b4.onnx", 0.3324),
    ("xception41", "xception41.onnx", 0.3334),
    ("vit_base_patch16_224", "vit_base_patch16_224.onnx", 0.3341),
]

_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

_instance = None


def _sigmoid(x: float) -> float:
    return float(1.0 / (1.0 + np.exp(-x)))


def preprocess_face(face_rgb: np.ndarray) -> np.ndarray:
    """RGB uint8 face crop -> float32 [1,3,224,224], the same as the notebook's validation transform."""
    import cv2

    img = cv2.resize(face_rgb, (224, 224), interpolation=cv2.INTER_LINEAR).astype(np.float32) / 255.0
    img = (img - _MEAN) / _STD
    return np.transpose(img, (2, 0, 1))[None, ...].astype(np.float32)


class FaceEnsemble:
    def __init__(self, models_dir: str):
        import onnxruntime as ort

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = runtime.onnx_threads()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        self.members: List[Tuple[str, "ort.InferenceSession", float]] = []
        for name, filename, weight in MODEL_FILES:
            path = os.path.join(models_dir, filename)
            if not os.path.exists(path):
                log.warning("Face model file missing: %s", path)
                continue
            session = ort.InferenceSession(path, sess_options=opts, providers=["CPUExecutionProvider"])
            self.members.append((name, session, weight))
        if not self.members:
            raise FileNotFoundError(f"No face model files (.onnx) found in '{models_dir}'.")
        log.info("Face ensemble ready with %d model(s).", len(self.members))

    def predict(self, face_rgb: np.ndarray) -> dict:
        """Returns {'ensemble': P(fake) 0..1, 'models': {name: P(fake)}}."""
        batch = preprocess_face(face_rgb)
        per_model = {}
        total_w = 0.0
        acc = 0.0
        for name, session, weight in self.members:
            logit = float(np.asarray(session.run(None, {"image": batch})[0]).reshape(-1)[0])
            p = _sigmoid(logit)
            per_model[name] = p
            acc += weight * p
            total_w += weight
        return {"ensemble": acc / total_w, "models": per_model}


def get_face_ensemble() -> FaceEnsemble:
    global _instance
    if _instance is None:
        _instance = FaceEnsemble(settings.models_dir)
    return _instance


# ---------------------------------------------------------------------------
# Finding a face (OpenCV's built-in detector: no extra download needed)
# ---------------------------------------------------------------------------

_cascade = None


def _get_cascade():
    global _cascade
    if _cascade is None:
        import cv2

        _cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        if _cascade.empty():
            raise RuntimeError("OpenCV's face detector file could not be loaded.")
    return _cascade


def find_face(rgb: np.ndarray) -> Optional[np.ndarray]:
    """
    Finds the largest front-facing face and returns a square crop around it (with some of the
    hair/neck around it, like the training photos), or None if no face is found.
    """
    import cv2

    h, w = rgb.shape[:2]
    scale = 800.0 / max(h, w) if max(h, w) > 800 else 1.0
    small = cv2.resize(rgb, (int(w * scale), int(h * scale))) if scale != 1.0 else rgb
    gray = cv2.cvtColor(small, cv2.COLOR_RGB2GRAY)
    gray = cv2.equalizeHist(gray)

    min_side = max(40, int(0.08 * min(gray.shape[:2])))
    faces = _get_cascade().detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=6, minSize=(min_side, min_side)
    )
    if len(faces) == 0:
        return None

    x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])
    x, y, fw, fh = [int(v / scale) for v in (x, y, fw, fh)]

    side = int(1.6 * max(fw, fh))
    side = min(side, h, w)
    cx = x + fw // 2
    cy = y + fh // 2 - int(0.05 * fh)
    x0 = int(np.clip(cx - side // 2, 0, w - side))
    y0 = int(np.clip(cy - side // 2, 0, h - side))
    return rgb[y0:y0 + side, x0:x0 + side]