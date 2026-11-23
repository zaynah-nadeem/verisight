"""
Downloads the Community Forensics model (first run only, ~90 MB) and scores some images.

Run from the backend folder, with the venv active:
    python check_commfor.py path\to\photo1.jpg path\to\ai_image.png

For each image it prints the chance (0-100%) that it is AI-generated.
"""
import sys
import time

from PIL import Image

from app.services.inference.commfor import get_detector

if len(sys.argv) < 2:
    print("Give at least one image path, e.g.  python check_commfor.py my_photo.jpg")
    sys.exit(1)

t0 = time.time()
print("Loading the model (the first run downloads about 90 MB)...")
detector = get_detector()
print(f"Loaded in {time.time() - t0:.1f}s, running on: {detector.device}\n")

for path in sys.argv[1:]:
    try:
        img = Image.open(path)
    except Exception as e:
        print(f"{path}: could not open ({e})")
        continue
    t1 = time.time()
    p = detector.predict([img])[0]
    print(f"{path}\n    AI-generated probability: {p * 100:.1f}%   ({time.time() - t1:.2f}s)")