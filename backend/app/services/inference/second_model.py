"""
The main detector: Bombek1/ai-image-detector-siglip-dinov2 (a SigLIP2 + DINOv2 ensemble).

It is a general "is this image AI-generated?" model. In our own tests it caught ChatGPT images
that the older Community Forensics model missed completely. It is big (about 6.6 GB on disk
once the SigLIP and DINOv2 parts are cached) and slow on a CPU (about 30 s per image).

How it is loaded: the model's own Python file (model.py) is downloaded from Hugging Face at the
exact revision set in config.py (settings.second_model_revision) and used as is. Pinning the
revision means a later change on Hugging Face cannot change the code that runs here.

predict_path(path) returns the probability (0..1) that the image is AI-generated.
"""
import importlib.util
import logging
import os
from typing import Optional

from ...config import settings
from . import runtime

log = logging.getLogger("detectors")

_instance = None
_load_error: Optional[str] = None

# The highlight map follows the score back to these blocks of the DINOv2 part (counted from the end)
# and averages them. Chosen by comparing 9 combinations on a test picture (heatmap_lab.py).
HEAT_LAYERS = (-2, -6, -12)


def _download(filename: str) -> str:
    from huggingface_hub import hf_hub_download

    kwargs = dict(repo_id=settings.second_model_repo, filename=filename, revision=settings.second_model_revision)
    try:
        return hf_hub_download(**kwargs)
    except Exception as first_error:
        # offline (for example at a demo with no internet): use the copy already on this computer
        try:
            return hf_hub_download(**kwargs, local_files_only=True)
        except Exception:
            raise first_error


def save_tiny_png(Image) -> str:
    from .media import save_png_temp

    return save_png_temp(Image.new("RGB", (64, 64), (128, 128, 128)))


class SecondModel:
    def __init__(self):
        runtime.configure_threads()
        import torch

        model_py = _download("model.py")
        _download("config.json")  # the model code reads it from the same folder
        weights = _download("pytorch_model.pt")

        spec = importlib.util.spec_from_file_location("ai_image_detector_model", model_py)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        log.info("Loading the main detector (this takes a minute the first time)...")
        self.detector = module.AIImageDetector(weights)
        self.int8 = False
        self.float32 = False
        self._frozen = False

        if settings.second_model_float32:
            self._to_float32()
            if not self.float32:
                # the conversion failed part-way: start again from a clean copy of the model
                self.detector = module.AIImageDetector(weights)

        if settings.second_model_quantize:
            self._quantize(torch)
            if not self.int8:
                # compression failed part-way: start again from a clean copy of the model
                self.detector = module.AIImageDetector(weights)
                if self.float32:
                    self._to_float32()

        log.info("Main detector ready (float32=%s, int8=%s).", self.float32, self.int8)

    def _to_float32(self) -> None:
        """
        The model's code loads its SigLIP part in bfloat16, which is slow on many CPUs.
        This converts everything to float32. It is checked with a tiny test picture; if anything
        fails the caller goes back to a clean copy of the model.
        """
        path = None
        try:
            self.detector.model.float()
            from PIL import Image

            path = save_tiny_png(Image)
            self.predict_path(path)
            self.float32 = True
            log.info("The main detector now runs in float32.")
        except Exception as e:
            log.warning("float32 conversion failed (%s: %s); using the model as it is.", type(e).__name__, e)
        finally:
            if path and os.path.exists(path):
                os.remove(path)

    def _quantize(self, torch) -> None:
        """
        int8 compression of the linear layers, done in place (a copy would need twice the memory).
        It is checked with a tiny test picture; if anything fails we go back to the normal model.
        """
        path = None
        try:
            torch.ao.quantization.quantize_dynamic(
                self.detector.model, {torch.nn.Linear}, dtype=torch.qint8, inplace=True
            )
            from PIL import Image

            path = save_tiny_png(Image)
            self.predict_path(path)
            self.int8 = True
            log.info("int8 compression applied to the main detector.")
        except Exception as e:
            log.warning("int8 compression failed (%s: %s); using the normal model.", type(e).__name__, e)
        finally:
            if path and os.path.exists(path):
                os.remove(path)

    def predict_path(self, path: str) -> float:
        import torch

        with torch.inference_mode():
            result = self.detector.predict(path)
        return float(result["probability"])

    def predict_with_map(self, path: str):
        """
        The same score as predict_path, plus a coarse map of which parts of the picture the
        score is most sensitive to.
        Returns (probability, grid). grid is a small numpy array (28 x 28, values 0..1) or None.
        If the map cannot be made for any reason, the normal score is returned with grid = None.
        """
        try:
            return self._score_and_map(path)
        except Exception as e:
            log.warning("The highlight map failed (%s: %s); using the plain score.", type(e).__name__, e)
            return self.predict_path(path), None

    def _score_and_map(self, path: str):
        import numpy as np
        import torch
        from PIL import Image

        det = self.detector
        model = det.model

        # Nothing here needs to learn. With no weight keeping a gradient, the computer only
        # remembers the blocks after the first hook below, so this stays cheap.
        if not self._frozen:
            for p in model.parameters():
                p.requires_grad_(False)
            self._frozen = True

        blocks = model.dinov2.blocks
        picked = sorted({max(-len(blocks), k) for k in HEAT_LAYERS})   # e.g. [-12, -6, -2]
        first = picked[0]
        captured = {}

        def make_hook(k):
            def pre(module, args, kwargs):
                x = args[0] if args else kwargs["x"]
                if k == first:
                    x = x.detach().requires_grad_(True)   # where the trace starts
                    captured[k] = x
                    if args:
                        return (x,) + tuple(args[1:]), kwargs
                    new_kwargs = dict(kwargs)
                    new_kwargs["x"] = x
                    return args, new_kwargs
                captured[k] = x                            # later blocks: just remember the input
                return None
            return pre

        handles = [blocks[k].register_forward_pre_hook(make_hook(k), with_kwargs=True) for k in picked]
        try:
            image = Image.open(path)
            if image.mode != "RGB":
                image = image.convert("RGB")
            siglip_pixels = det.siglip_processor(images=image, return_tensors="pt")["pixel_values"].to(det.device)
            dinov2_pixels = det.dinov2_transform(image).unsqueeze(0).to(det.device)

            with torch.enable_grad():
                logits, _, _ = model(siglip_pixels, dinov2_pixels)
                logit = logits.reshape(-1)[0]
                xs = [captured[k] for k in picked]
                grads = torch.autograd.grad(logit, xs)
        finally:
            for h in handles:
                h.remove()

        probability = float(torch.sigmoid(logit.detach()))

        # For each block: how sensitive the score is to each picture patch ("gradient size").
        # In our tests this pointed at faces and fine detail; the other methods pointed at the background.
        total = None
        for x, g in zip(xs, grads):
            act = x.detach()[0].float()
            n = int(act.shape[0])
            side = prefix = None
            for k in range(0, 9):          # the first few tokens are not picture patches
                s = int(round((n - k) ** 0.5))
                if s * s == n - k:
                    side, prefix = s, k
                    break
            if side is None:
                continue
            a = act[prefix:]
            vec = g[0].float()[prefix:].norm(dim=-1)

            # the model has a few "glitch" patches with huge activations: leave them out
            norms = a.norm(dim=-1)
            med = norms.median()
            mad = (norms - med).abs().median()
            z = (norms - med) / (1.4826 * mad + 1e-6)
            vec = vec.clone()
            vec[z > 6] = 0

            m = vec.reshape(side, side).cpu().numpy()
            pos = m[m > 0]
            if pos.size == 0 or not np.isfinite(m).all():
                continue
            hi = float(np.percentile(pos, 99))
            if hi <= 0:
                continue
            m = np.clip(m / hi, 0.0, 1.0)
            total = m if total is None else total + m

        if total is None:
            return probability, None
        peak = float(total.max())
        if not np.isfinite(peak) or peak <= 0:
            return probability, None
        return probability, total / peak


def get_second_model() -> SecondModel:
    """Loads the model the first time it is needed, then reuses it."""
    global _instance, _load_error
    if _instance is None:
        try:
            _instance = SecondModel()
            _load_error = None
        except Exception as e:
            _load_error = f"{type(e).__name__}: {e}"
            raise
    return _instance


def last_error() -> Optional[str]:
    return _load_error