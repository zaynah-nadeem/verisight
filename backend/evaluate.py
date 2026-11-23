"""
Measures how well the image pipeline works on YOUR test photos, so the limits are chosen from
evidence and the numbers can go into your report.

Folder layout (create it inside the backend folder; any .jpg/.jpeg/.png/.webp files):

    test_set\\real\\   photos that are certainly real (best: taken with your own phone camera,
                      different scenes: indoors, outdoors, people, objects, screenshots of nothing)
    test_set\\ai\\     images that are certainly AI-generated (different tools: ChatGPT, Gemini,
                      Midjourney, Flux, ... try to use at least 3 different tools)

Run it from the backend folder (venv active):

    python evaluate.py

It writes evaluation_results.csv and prints the tables. It tests the models only: the content
credentials (C2PA) shortcut is not used here, so you see the models' own accuracy.
"""
import argparse
import csv
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif")


def list_images(folder):
    if not os.path.isdir(folder):
        return []
    return sorted(os.path.join(folder, f) for f in os.listdir(folder) if f.lower().endswith(EXTENSIONS))


def auc(real_scores, ai_scores):
    """Chance that a random AI image scores higher than a random real one (1.0 perfect, 0.5 guessing)."""
    if not real_scores or not ai_scores:
        return float("nan")
    wins = sum((a > r) + 0.5 * (a == r) for a in ai_scores for r in real_scores)
    return wins / (len(real_scores) * len(ai_scores))


def verdict_for(score, real_below, ai_above):
    if score >= ai_above:
        return "ai_generated"
    if score <= real_below:
        return "likely_authentic"
    return "inconclusive"


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--folder", default="test_set")
    parser.add_argument("--csv", default="evaluation_results.csv")
    args = parser.parse_args(argv)

    from app.config import settings
    from app.services.inference import image_detector as D
    from app.services.inference.media import open_image

    settings.cache_enabled = False

    items = [(p, "real") for p in list_images(os.path.join(args.folder, "real"))]
    items += [(p, "ai") for p in list_images(os.path.join(args.folder, "ai"))]
    n_real = sum(1 for _, k in items if k == "real")
    n_ai = len(items) - n_real
    if n_real == 0 or n_ai == 0:
        print(f"Put images in {args.folder}\\real and {args.folder}\\ai first (found {n_real} real, {n_ai} AI).")
        return 1
    print(f"Found {n_real} real and {n_ai} AI images. About {len(items) * 12 // 60 + 1} minutes on a CPU.\n")

    rows = []
    for i, (path, truth) in enumerate(items, 1):
        t = time.time()
        img = open_image(open(path, "rb").read())
        score, source = D._main_score(img)
        face = D._face_vote(img)
        if score is None:
            print("No detector could score the images. Check the settings and try again.")
            return 1
        with_faces = D._combine(score, source, face)["verdict"]
        without_faces = D._combine(score, source, None)["verdict"]
        q = face.get("ensemble") if face and face.get("found") else None
        rows.append({
            "file": os.path.relpath(path, args.folder), "truth": truth, "main_score": round(score, 4),
            "face_found": bool(q is not None), "face_score": "" if q is None else round(q, 4),
            "verdict_with_faces": with_faces, "verdict_without_faces": without_faces,
        })
        print(f"[{i}/{len(items)}] {truth:4}  main {score * 100:5.1f}%  "
              f"{'face ' + format(q * 100, '.0f') + '%' if q is not None else 'no face   '}  "
              f"-> {with_faces:16} ({time.time() - t:.0f} s)  {os.path.basename(path)}")

    with open(args.csv, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    real = [r for r in rows if r["truth"] == "real"]
    ai = [r for r in rows if r["truth"] == "ai"]
    rs, as_ = [r["main_score"] for r in real], [r["main_score"] for r in ai]

    print("\n=== How well the main detector separates real from AI (AUC) ===")
    print(f"AUC = {auc(rs, as_):.3f}   (1.0 = perfect, 0.5 = guessing)")
    print(f"average score: real {sum(rs) / len(rs) * 100:.0f}%   AI {sum(as_) / len(as_) * 100:.0f}%")

    print(f"\n=== Verdicts at the current limits ({settings.real_below:.0%} / {settings.ai_above:.0%}) ===")
    for label, key in (("with your face models", "verdict_with_faces"), ("without your face models", "verdict_without_faces")):
        print(f"\n{label}:")
        for name, group in (("real photos", real), ("AI images", ai)):
            c = {v: sum(1 for r in group if r[key] == v) for v in ("ai_generated", "inconclusive", "likely_authentic")}
            print(f"  {name:12} (n={len(group)})  called AI: {c['ai_generated']}   inconclusive: {c['inconclusive']}   called real: {c['likely_authentic']}")

    print("\n=== What different 'AI above' limits would do (real_below stays "
          f"{settings.real_below:.0%}) ===")
    print("AI-above   real photos wrongly called AI   AI images caught   AI images missed as real")
    for limit in (0.50, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95):
        fp = sum(1 for s in rs if verdict_for(s, settings.real_below, limit) == "ai_generated")
        tp = sum(1 for s in as_ if verdict_for(s, settings.real_below, limit) == "ai_generated")
        miss = sum(1 for s in as_ if verdict_for(s, settings.real_below, limit) == "likely_authentic")
        mark = "  <- current" if abs(limit - settings.ai_above) < 1e-9 else ""
        print(f"  {limit:.0%}      {fp:>2} of {len(rs):<3} ({fp / len(rs):>4.0%})              "
              f"{tp:>2} of {len(as_):<3} ({tp / len(as_):>4.0%})    {miss:>2} of {len(as_)}{mark}")

    print("\nReal photos with the highest AI scores (the ones the detector gets wrong):")
    for r in sorted(real, key=lambda r: -r["main_score"])[:5]:
        print(f"  {r['main_score'] * 100:5.1f}%  {r['file']}")
    print("AI images with the lowest AI scores (the ones it misses):")
    for r in sorted(ai, key=lambda r: r["main_score"])[:5]:
        print(f"  {r['main_score'] * 100:5.1f}%  {r['file']}")
    print(f"\nFull table saved to {args.csv}")
    return 0


if __name__ == "__main__":
    sys.exit(main())