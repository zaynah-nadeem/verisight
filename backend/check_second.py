"""
Tries a second detector, Bombek1/ai-image-detector-siglip-dinov2, on your images.
The first run downloads about 2.1 GB, so use a good connection.

Run from the backend folder, venv active:
    python check_second.py "C:/path/image1.png" "C:/path/image2.png"
"""
import os
import sys
import time

from huggingface_hub import hf_hub_download

REPO = "Bombek1/ai-image-detector-siglip-dinov2"

if len(sys.argv) < 2:
    print("Give at least one image path.")
    sys.exit(1)

print("Downloading the code and settings...")
model_py = hf_hub_download(REPO, "model.py")
hf_hub_download(REPO, "config.json")

print("\nThis model comes with its own code, which will run on your computer:")
print("   ", model_py)
print("Open it and skim it before continuing (you are checking it does nothing odd,")
print("like deleting files or sending data somewhere).")
if input("Press Enter to continue, or type n to stop: ").strip().lower() == "n":
    sys.exit(0)

print("\nDownloading the model weights (about 2.1 GB, first run only)...")
weights = hf_hub_download(REPO, "pytorch_model.pt")

sys.path.insert(0, os.path.dirname(model_py))
from model import AIImageDetector  # noqa: E402

t0 = time.time()
detector = AIImageDetector(weights)
print(f"Loaded in {time.time() - t0:.1f}s\n")

for path in sys.argv[1:]:
    t1 = time.time()
    try:
        result = detector.predict(path)
    except Exception as e:
        print(f"{path}: failed ({e})")
        continue
    print(path)
    print("   result:", result, f"({time.time() - t1:.1f}s)")