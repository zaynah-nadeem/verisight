"""
Times the detector and shows what it says, so you can compare settings on YOUR laptop.

Run it from the backend folder (venv active). Use the same images each time:

    python bench_models.py "C:/path/image1.png" "C:/path/image2.jpg"
    python bench_models.py --float32 "C:/path/image1.png" "C:/path/image2.jpg"

Compare the times and the percentages. If the --float32 scores stay close to the normal ones
and it is clearly faster, turn it on for good by adding this line to backend/.env:
    SECOND_MODEL_FLOAT32=true
(--quantize, int8 compression, did not work with this model, so it is not worth testing.)
"""
import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

parser = argparse.ArgumentParser()
parser.add_argument("images", nargs="+")
parser.add_argument("--quantize", action="store_true", help="use int8 compression for the main detector")
parser.add_argument("--float32", action="store_true", help="run the main detector in float32 instead of bfloat16")
parser.add_argument("--no-faces", action="store_true", help="skip your own face models")
args = parser.parse_args()

from app.config import settings  # noqa: E402

settings.second_model_quantize = args.quantize
settings.second_model_float32 = args.float32
settings.cache_enabled = False          # always do the real work
if args.no_faces:
    settings.face_models_enabled = False

from app.services.inference import image_detector  # noqa: E402
from app.services.inference.second_model import get_second_model  # noqa: E402

print(f"Settings: float32={args.float32}  int8={args.quantize}  face models={settings.face_models_enabled}  "
      f"threads={settings.cpu_threads or os.cpu_count()}")

t0 = time.time()
get_second_model()
print(f"Loading the main detector took {time.time() - t0:.1f} s (happens once when the server starts)\n")

times = []
for path in args.images:
    with open(path, "rb") as f:
        data = f.read()
    t = time.time()
    result = image_detector.run_image_detection(data)
    took = time.time() - t
    times.append(took)
    print(path)
    print(f"   {result['verdict']}   likelihood range {result['confidence_low']}-{result['confidence_high']}%   ({took:.1f} s)")
    for line in result["explanation"]:
        print(f"   - {line}")
    print()

print(f"Average time per image: {sum(times) / len(times):.1f} s")