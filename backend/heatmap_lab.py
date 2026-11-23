"""
Highlight lab: tries several ways of making the highlight in ONE pass over a picture and saves
a contact sheet so you can compare them side by side.

Run it in the backend folder with the venv active:
    python heatmap_lab.py "C:\\path\\to\\photo.jpg"

It saves (in the backend folder):
    heatmap_lab_<number>.png   rows = how far back in the network, columns = method
    heatmap_lab_<number>.npz   the raw numbers
"""
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))

LAYERS = [-2, -6, -12]  # which block's input the score is traced back to
METHODS = [("gxa", "gradient x activation"), ("gc", "Grad-CAM"), ("gn", "gradient size")]
THUMB_W = 230


def overlay_on(photo, unit):
    """photo: small RGB picture, unit: 2-D array 0..1. Returns the photo with a red glow on top."""
    from PIL import Image, ImageFilter

    w, h = photo.size
    heat = Image.fromarray((np.clip(unit, 0, 1) * 255).astype("uint8"), "L")
    heat = heat.resize((w, h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(radius=4))
    v = np.asarray(heat, dtype="float32") / 255.0
    peak = float(v.max())
    if peak > 0:
        v = v / peak
    s = np.clip((v - 0.30) / 0.70, 0.0, 1.0)
    rgba = np.zeros((h, w, 4), dtype="uint8")
    rgba[..., 0] = 255
    rgba[..., 1] = (200 * (1 - s)).astype("uint8")
    rgba[..., 2] = 30
    rgba[..., 3] = (215 * s).astype("uint8")
    out = photo.convert("RGB").copy()
    layer = Image.fromarray(rgba, "RGBA")
    out.paste(layer, (0, 0), layer)
    return out


def unit_grid(g):
    """Scale a raw grid to 0..1 using a high percentile of its positive values."""
    g = np.maximum(np.asarray(g, dtype="float32"), 0.0)
    pos = g[g > 0]
    if pos.size == 0:
        return g
    hi = float(np.percentile(pos, 99))
    return np.clip(g / (hi if hi > 0 else float(g.max())), 0.0, 1.0)


def render_sheet(img, panels, out_path):
    from PIL import Image, ImageDraw

    ratio = img.size[1] / float(img.size[0])
    tw, th = THUMB_W, max(1, round(THUMB_W * ratio))
    photo = img.convert("RGB").resize((tw, th))
    pad, head, left = 8, 22, 70
    cols, rows = len(METHODS), len(LAYERS)
    W = left + cols * (tw + pad) + pad
    H = head + rows * (th + pad) + pad
    sheet = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(sheet)
    for c, (_, label) in enumerate(METHODS):
        d.text((left + c * (tw + pad) + pad, 5), label, fill=(0, 0, 0))
    for r, k in enumerate(LAYERS):
        y = head + r * (th + pad)
        d.text((4, y + th // 2 - 6), f"block {k}", fill=(0, 0, 0))
        for c, (key, _) in enumerate(METHODS):
            x = left + c * (tw + pad) + pad
            sheet.paste(overlay_on(photo, unit_grid(panels[(k, key)])), (x, y))
    sheet.save(out_path)


def main():
    if len(sys.argv) < 2:
        print('Usage: python heatmap_lab.py "C:\\path\\to\\photo.jpg"')
        return
    path = sys.argv[1]

    import torch
    from PIL import Image

    from app.services.inference.media import open_image
    from app.services.inference.second_model import get_second_model

    img = open_image(open(path, "rb").read())
    print(f"Picture the detector sees: {img.size[0]} x {img.size[1]}")

    t0 = time.time()
    det = get_second_model().detector
    model = det.model
    print(f"Model ready after {time.time() - t0:.1f} s")

    for p in model.parameters():
        p.requires_grad_(False)

    blocks = model.dinov2.blocks
    first = min(LAYERS)
    caps = {}

    def make_hook(k):
        def pre(module, args, kwargs):
            x = args[0] if args else kwargs["x"]
            if k == first:
                x = x.detach().requires_grad_(True)  # the starting point of the trace
                caps[k] = x
                if args:
                    return (x,) + tuple(args[1:]), kwargs
                new_kwargs = dict(kwargs)
                new_kwargs["x"] = x
                return args, new_kwargs
            caps[k] = x  # later blocks: just remember what goes in
            return None

        return pre

    handles = [blocks[k].register_forward_pre_hook(make_hook(k), with_kwargs=True) for k in LAYERS]
    try:
        rgb = img.convert("RGB")
        siglip_pixels = det.siglip_processor(images=rgb, return_tensors="pt")["pixel_values"].to(det.device)
        dinov2_pixels = det.dinov2_transform(rgb).unsqueeze(0).to(det.device)
        t1 = time.time()
        with torch.enable_grad():
            logits, _, _ = model(siglip_pixels, dinov2_pixels)
            logit = logits.reshape(-1)[0]
            xs = [caps[k] for k in LAYERS]
            grads = torch.autograd.grad(logit, xs)
        print(f"Score {float(torch.sigmoid(logit.detach())):.4f}, pass took {time.time() - t1:.1f} s")
    finally:
        for h in handles:
            h.remove()

    panels = {}
    for k, x, g in zip(LAYERS, xs, grads):
        act = x.detach()[0].float()
        gr = g[0].float()
        n = int(act.shape[0])
        side = prefix = None
        for pre_tokens in range(0, 9):
            s = int(round((n - pre_tokens) ** 0.5))
            if s * s == n - pre_tokens:
                side, prefix = s, pre_tokens
                break
        if side is None:
            print(f"block {k}: unexpected number of tokens ({n}), skipped")
            continue

        a, gg = act[prefix:], gr[prefix:]
        # patches with an unusually large activation (the known glitch patches) are left out
        norms = a.norm(dim=-1)
        med = norms.median()
        mad = (norms - med).abs().median()
        z = (norms - med) / (1.4826 * mad + 1e-6)
        flagged = z > 6
        where = [(int(i) // side, int(i) % side) for i in torch.nonzero(flagged).flatten()[:8]]
        print(f"block {k}: {int(flagged.sum())} glitch patch(es) left out {where}")

        weights = gg.mean(dim=0)
        for key, vec in (
            ("gxa", (a * gg).sum(-1)),
            ("gc", (a * weights).sum(-1)),
            ("gn", gg.norm(dim=-1)),
        ):
            v = vec.clone()
            if key != "gn":
                v = torch.relu(v)
            v[flagged] = 0
            panels[(k, key)] = v.reshape(side, side).cpu().numpy()

    stamp = int(time.time())
    out_png = os.path.join(HERE, f"heatmap_lab_{stamp}.png")
    render_sheet(img, panels, out_png)
    np.savez(os.path.join(HERE, f"heatmap_lab_{stamp}.npz"), **{f"b{-k}_{key}": v for (k, key), v in panels.items()})
    print(f"Saved: {out_png}")
    print("Open it. Rows are blocks -2, -6, -12 (how far back the score is traced). Columns are the three methods.")
    print("Tell me which panel points at something that makes sense.")


if __name__ == "__main__":
    main()