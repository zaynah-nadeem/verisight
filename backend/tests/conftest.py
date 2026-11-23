"""
Runs before every test file: points the app at a throwaway database and upload folder,
so the tests never touch your real data.
"""
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="deepfake_tests_")
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(_tmp, 'test.db')}"
os.environ["UPLOAD_DIR"] = os.path.join(_tmp, "uploads")
os.environ["GUEST_SCAN_LIMIT"] = "3"