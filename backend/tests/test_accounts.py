"""
Tests for accounts, saved scans and the guest limit.
Run from the backend folder (venv active):   pytest tests -v
"""
import io
import os

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
PIL = pytest.importorskip("PIL.Image")

from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

PASSWORD = "correct horse"


@pytest.fixture(autouse=True)
def fresh_database():
    from app.main import UPLOAD_DIR
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    for name in os.listdir(UPLOAD_DIR):  # start every test with an empty upload folder
        os.remove(os.path.join(UPLOAD_DIR, name))
    yield


@pytest.fixture
def client():
    return TestClient(app)


def jpeg_bytes(color=(200, 120, 40)) -> bytes:
    buf = io.BytesIO()
    PIL.new("RGB", (64, 64), color).save(buf, "JPEG")
    return buf.getvalue()


def signup(client, email="zaynah@example.com", name="Zaynah", password=PASSWORD):
    return client.post("/auth/signup", json={"name": name, "email": email, "password": password})


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def scan_image(client, headers=None, name="photo.jpg"):
    return client.post("/detect/image", files={"file": (name, jpeg_bytes(), "image/jpeg")}, headers=headers or {})


# ---------- accounts ----------

def test_signup_returns_token_and_me_works(client):
    r = signup(client)
    assert r.status_code == 201
    body = r.json()
    assert body["user"]["email"] == "zaynah@example.com" and body["user"]["name"] == "Zaynah"
    me = client.get("/auth/me", headers=auth(body["access_token"]))
    assert me.status_code == 200 and me.json()["email"] == "zaynah@example.com"


def test_email_is_case_insensitive_and_duplicates_are_refused(client):
    assert signup(client, email="Zaynah@Example.com").status_code == 201
    assert signup(client, email="zaynah@example.com").status_code == 409


def test_password_is_never_stored_as_plain_text(client):
    from app.database import SessionLocal
    from app.models import User
    signup(client)
    with SessionLocal() as db:
        stored = db.query(User).one().hashed_password
    assert PASSWORD not in stored and stored.startswith("$2")


def test_weak_password_and_bad_email_are_rejected(client):
    assert signup(client, password="short").status_code == 422
    assert signup(client, email="not-an-email").status_code == 422


def test_login(client):
    signup(client)
    ok = client.post("/auth/login", json={"email": "ZAYNAH@example.com", "password": PASSWORD})
    assert ok.status_code == 200 and ok.json()["access_token"]
    bad = client.post("/auth/login", json={"email": "zaynah@example.com", "password": "wrong password"})
    unknown = client.post("/auth/login", json={"email": "nobody@example.com", "password": PASSWORD})
    assert bad.status_code == 401 and unknown.status_code == 401
    assert bad.json()["detail"] == unknown.json()["detail"]  # can't tell which emails exist


def test_bad_token_is_refused_not_treated_as_guest(client):
    assert client.get("/auth/me", headers=auth("garbage")).status_code == 401
    r = scan_image(client, headers=auth("garbage"))
    assert r.status_code == 401


# ---------- saved scans ----------

def test_signed_in_scan_is_saved_and_listed(client):
    token = signup(client).json()["access_token"]
    r = scan_image(client, headers=auth(token), name="lunch.jpg")
    assert r.status_code == 200
    scan_id = r.json()["scan_id"]
    assert scan_id

    listing = client.get("/scans", headers=auth(token))
    assert listing.status_code == 200
    items = listing.json()
    assert len(items) == 1 and items[0]["id"] == scan_id
    assert items[0]["file_name"] == "lunch.jpg"
    assert items[0]["has_file"] is True
    assert items[0]["result"]["c2pa"]["status"] == "absent"
    assert items[0]["created_at"].endswith("Z")

    one = client.get(f"/scans/{scan_id}", headers=auth(token))
    assert one.status_code == 200 and one.json()["result"]["verdict"]["verdict"]

    file = client.get(f"/scans/{scan_id}/file", headers=auth(token))
    assert file.status_code == 200 and file.content[:2] == b"\xff\xd8"


def test_scans_need_a_login(client):
    assert client.get("/scans").status_code == 401
    assert client.delete("/scans").status_code == 401


def test_one_user_cannot_see_another_users_scans(client):
    a = signup(client, email="a@example.com").json()["access_token"]
    b = signup(client, email="b@example.com").json()["access_token"]
    scan_id = scan_image(client, headers=auth(a)).json()["scan_id"]

    assert client.get("/scans", headers=auth(b)).json() == []
    assert client.get(f"/scans/{scan_id}", headers=auth(b)).status_code == 404
    assert client.get(f"/scans/{scan_id}/file", headers=auth(b)).status_code == 404
    assert client.delete(f"/scans/{scan_id}", headers=auth(b)).status_code == 404
    assert client.get(f"/scans/{scan_id}", headers=auth(a)).status_code == 200


def test_delete_one_scan_removes_its_file(client):
    from app.database import SessionLocal
    from app.models import Scan
    token = signup(client).json()["access_token"]
    scan_id = scan_image(client, headers=auth(token)).json()["scan_id"]
    with SessionLocal() as db:
        path = db.get(Scan, scan_id).image_path
    assert os.path.exists(path)

    assert client.delete(f"/scans/{scan_id}", headers=auth(token)).status_code == 204
    assert not os.path.exists(path)
    assert client.get("/scans", headers=auth(token)).json() == []


def test_clear_all_scans(client):
    token = signup(client).json()["access_token"]
    for _ in range(3):
        scan_image(client, headers=auth(token))
    assert len(client.get("/scans", headers=auth(token)).json()) == 3
    assert client.delete("/scans", headers=auth(token)).status_code == 204
    assert client.get("/scans", headers=auth(token)).json() == []


def test_list_is_newest_first_and_paged(client):
    token = signup(client).json()["access_token"]
    ids = [scan_image(client, headers=auth(token)).json()["scan_id"] for _ in range(3)]
    listing = client.get("/scans?limit=2", headers=auth(token)).json()
    assert [s["id"] for s in listing] == [ids[2], ids[1]]
    rest = client.get("/scans?limit=2&offset=2", headers=auth(token)).json()
    assert [s["id"] for s in rest] == [ids[0]]


# ---------- guests ----------

DEVICE = {"X-Device-Id": "device-aaaaaaaa-1111"}
OTHER_DEVICE = {"X-Device-Id": "device-bbbbbbbb-2222"}


def test_guest_needs_a_device_id(client):
    assert scan_image(client).status_code == 400
    assert scan_image(client, headers={"X-Device-Id": "x"}).status_code == 400


def test_guest_scan_works_but_nothing_is_stored(client):
    from app.database import SessionLocal
    from app.main import UPLOAD_DIR
    from app.models import Scan
    r = scan_image(client, headers=DEVICE)
    assert r.status_code == 200 and r.json()["scan_id"] is None
    with SessionLocal() as db:
        assert db.query(Scan).count() == 0
    assert os.listdir(UPLOAD_DIR) == []  # the file was deleted again


def test_guest_limit_is_enforced_per_device(client):
    for i in range(3):
        assert scan_image(client, headers=DEVICE).status_code == 200
    blocked = scan_image(client, headers=DEVICE)
    assert blocked.status_code == 403 and blocked.json()["detail"] == "guest_limit_reached"

    # a different phone still has its free scans
    assert scan_image(client, headers=OTHER_DEVICE).status_code == 200


def test_guest_usage_endpoint(client):
    assert client.get("/guest/usage", headers=DEVICE).json() == {"used": 0, "limit": 3, "remaining": 3}
    scan_image(client, headers=DEVICE)
    assert client.get("/guest/usage", headers=DEVICE).json() == {"used": 1, "limit": 3, "remaining": 2}


def test_signed_in_users_are_not_limited(client):
    token = signup(client).json()["access_token"]
    for _ in range(5):
        assert scan_image(client, headers={**auth(token), **DEVICE}).status_code == 200
    # and their scans did not use up the phone's guest allowance
    assert client.get("/guest/usage", headers=DEVICE).json()["used"] == 0