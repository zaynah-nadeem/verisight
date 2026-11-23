"""
Usage (backend folder, venv active):
    python check_file.py uploads\\3ab177a0-e99e-4265-ac81-64e8c7a92ea2.png
"""
import json
import mimetypes
import sys
from pathlib import Path

from c2pa import Reader, Settings, Context

path = sys.argv[1]
mime = mimetypes.guess_type(path)[0] or "image/jpeg"
anchors = Path(__file__).resolve().parent / "trust" / "anchors.pem"
print("anchors file exists:", anchors.exists())


def show(label, ctx=None):
    with open(path, "rb") as f:
        reader = Reader(mime, f, context=ctx) if ctx else Reader(mime, f)
        data = json.loads(reader.json())
    print(f"\n=== {label} ===")
    print("validation_state:", data.get("validation_state"))
    for v in data.get("validation_status") or []:
        print(" -", v.get("code"), "|", v.get("explanation"))
    active = (data.get("manifests") or {}).get(data.get("active_manifest"), {})
    print("signature_info:", json.dumps(active.get("signature_info"), indent=2))


show("WITHOUT trust list")

if anchors.exists():
    pem = anchors.read_text(encoding="utf-8")
    print("certificates in anchors file:", pem.count("BEGIN CERTIFICATE"))
    ctx = Context(settings=Settings.from_dict({
        "trust": {"trust_anchors": pem},
        "verify": {"verify_trust": True},
    }))
    show("WITH trust list", ctx)