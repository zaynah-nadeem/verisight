"""
Downloads the public C2PA trust lists and saves them as backend/trust/anchors.pem

Run from the backend folder (venv active):
    python fetch_trust_list.py
"""
import re
import sys
import urllib.request
from pathlib import Path

SOURCES = [
    ("C2PA trust list",
     "https://raw.githubusercontent.com/c2pa-org/conformance-public/main/trust-list/C2PA-TRUST-LIST.pem"),
    ("Content Credentials interim trust list",
     "https://contentcredentials.org/trust/anchors.pem"),
]

CERT_RE = re.compile(r"-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----", re.S)


def download(url):
    req = urllib.request.Request(url, headers={"User-Agent": "deepfake-detector-fyp"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def main():
    certs = []
    for name, url in SOURCES:
        try:
            found = CERT_RE.findall(download(url))
            print(f"OK    {name}: {len(found)} certificates")
            certs.extend(found)
        except Exception as e:
            print(f"FAIL  {name}: {e}")

    certs = list(dict.fromkeys(certs))  # remove duplicates, keep order
    if not certs:
        print("No certificates downloaded, nothing written.")
        sys.exit(1)

    out = Path(__file__).resolve().parent / "trust" / "anchors.pem"
    out.parent.mkdir(exist_ok=True)
    out.write_text("\n".join(certs) + "\n", encoding="utf-8")
    print(f"Wrote {len(certs)} certificates to {out}")


if __name__ == "__main__":
    main()