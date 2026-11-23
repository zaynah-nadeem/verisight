"""
Community Forensics detector (a general "is this image AI-generated?" model).

Paper:  Park & Owens, "Community Forensics: Using Thousands of Generators to Train
        Fake Image Detectors" (CVPR 2025).   Code (MIT): github.com/JeongsooP/Community-Forensics
Weights: Hugging Face  OwensLab/commfor-model-384  (small ViT, ~22M parameters, ~90 MB)

This file is a small self-contained loader, so the backend does not need the authors'
whole training repository. It does the same preprocessing the authors use for testing:
    resize shorter side to 440  ->  centre-crop 384  ->  scale to 0..1  ->  ImageNet normalise
and returns the probability that the image is FAKE (the model outputs one number; after a
sigmoid, close to 1 means AI-generated, close to 0 means real).
"""
import json
import logging
import os
from typing import List, Optional

import torch
import torch.nn as nn
import timm
from PIL import Image
from torchvision import transforms

log = logging.getLogger("commfor")

HF_REPO = "OwensLab/commfor-model-384"

# timm model used as the backbone for each (size, input, patch) the authors released
_BACKBONES = {
    ("small", 224, 32): "vit_small_patch32_224.augreg_in21k_ft_in1k",
    ("small", 224, 16): "vit_small_patch16_224.augreg_in21k_ft_in1k",
    ("small", 384, 32): "vit_small_patch32_384.augreg_in21k_ft_in1k",
    ("small", 384, 16): "vit_small_patch16_384.augreg_in21k_ft_in1k",
    ("tiny", 224, 16): "vit_tiny_patch16_224.augreg_in21k_ft_in1k",
    ("tiny", 384, 16): "vit_tiny_patch16_384.augreg_in21k_ft_in1k",
}
_HEAD_DIM = {"small": 384, "tiny": 192}

# resize / crop sizes the authors use at test time
_RESIZE_CROP = {224: (256, 224), 384: (440, 384)}


class _ViTClassifier(nn.Module):
    """Same layout as the authors' ViTClassifier, so their saved weights load directly."""

    def __init__(self, model_size="small", input_size=384, patch_size=16):
        super().__init__()
        name = _BACKBONES[(model_size, input_size, patch_size)]
        # pretrained=False: the checkpoint below overwrites every weight anyway,
        # so there is no need to download the ImageNet starting weights.
        self.vit = timm.create_model(name, pretrained=False)
        self.vit.head = nn.Linear(_HEAD_DIM[model_size], 1, bias=True)

    def forward(self, x):
        return self.vit(x)


class CommunityForensics:
    def __init__(self, source: str = HF_REPO, device: Optional[str] = None):
        """
        source: a Hugging Face repo id (downloaded once, then cached), or a local folder
                containing model.safetensors and config.json.
        """
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")

        config_path, weights_path = self._locate(source)

        cfg = {}
        if config_path and os.path.exists(config_path):
            with open(config_path, "r", encoding="utf-8") as f:
                cfg = json.load(f)
        model_size = cfg.get("model_size", "small")
        input_size = int(cfg.get("input_size", 384))
        patch_size = int(cfg.get("patch_size", 16))
        self.input_size = input_size

        model = _ViTClassifier(model_size, input_size, patch_size)

        from safetensors.torch import load_file

        state = load_file(weights_path)
        missing, unexpected = model.load_state_dict(state, strict=False)
        if missing or unexpected:
            # fail loudly: a half-loaded detector would give meaningless verdicts
            raise RuntimeError(
                f"Community Forensics weights do not match the model "
                f"(missing {len(missing)}, unexpected {len(unexpected)}). "
                f"First missing: {missing[:3]}; first unexpected: {unexpected[:3]}"
            )

        self.model = model.to(self.device).eval()

        resize, crop = _RESIZE_CROP[input_size]
        self.transform = transforms.Compose(
            [
                transforms.Resize(resize),
                transforms.CenterCrop(crop),
                transforms.ToTensor(),  # 0..1
                transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
            ]
        )
        log.info("Community Forensics loaded (%s, %d px, device=%s)", model_size, input_size, self.device)

    @staticmethod
    def _locate(source: str):
        if os.path.isdir(source):
            return os.path.join(source, "config.json"), os.path.join(source, "model.safetensors")
        from huggingface_hub import hf_hub_download

        weights = hf_hub_download(source, "model.safetensors")
        try:
            config = hf_hub_download(source, "config.json")
        except Exception:  # config is optional; the defaults match the released model
            config = None
        return config, weights

    @torch.no_grad()
    def predict(self, images: List[Image.Image], batch_size: int = 8) -> List[float]:
        """Returns, for each image, the probability (0..1) that it is AI-generated."""
        out: List[float] = []
        for i in range(0, len(images), batch_size):
            chunk = images[i : i + batch_size]
            batch = torch.stack([self.transform(im.convert("RGB")) for im in chunk]).to(self.device)
            probs = torch.sigmoid(self.model(batch)).squeeze(-1).float().cpu().tolist()
            out.extend(probs if isinstance(probs, list) else [probs])
        return out


_instance: Optional[CommunityForensics] = None


def get_detector() -> CommunityForensics:
    """Loads the model once, the first time it is needed, and reuses it afterwards."""
    global _instance
    if _instance is None:
        _instance = CommunityForensics(os.environ.get("COMMFOR_SOURCE", HF_REPO))
    return _instance