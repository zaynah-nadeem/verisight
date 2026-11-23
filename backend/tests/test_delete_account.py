"""
Tests for deleting an account.
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
    for name in os.listdir(UPLOAD_DIR):
        os.remove(os.path.join(UPLOAD_DIR, name))
    yield


@pytest.fixture
def client():
    return TestClient(app)


def jpeg_bytes() -> bytes:
    buf = io.BytesIO()
    PIL.new("RGB", (64, 64), (10, 120, 200)).save(buf, "JPEG")
    return buf.getvalue()


def signup(client, email="zaynah@example.com"):
    r = client.post("/auth/signup", json={"name": "Zaynah", "email": email, "password": PASSWORD})
    return r.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def scan(client, token):
    return client.post("/detect/image", files={"file": ("p.jpg", jpeg_bytes(), "image/jpeg")}, headers=auth(token))


def test_delete_needs_a_login(client):
    r = client.post("/auth/delete-account", json={"password": PASSWORD})
    assert r.status_code == 401


def test_wrong_password_deletes_nothing(client):
    token = signup(client)
    r = client.post("/auth/delete-account", json={"password": "not the password"}, headers=auth(token))
    assert r.status_code == 403
    assert r.json()["detail"] == "Wrong password."
    assert client.get("/auth/me", headers=auth(token)).status_code == 200


def test_delete_removes_account_scans_and_files(client):
    from app.main import UPLOAD_DIR
    token = signup(client)
    assert scan(client, token).status_code == 200
    assert len(os.listdir(UPLOAD_DIR)) == 1

    r = client.post("/auth/delete-account", json={"password": PASSWORD}, headers=auth(token))
    assert r.status_code == 204

    assert os.listdir(UPLOAD_DIR) == []                       # stored file is gone
    assert client.get("/auth/me", headers=auth(token)).status_code == 401  # old login no longer works
    login = client.post("/auth/login", json={"email": "zaynah@example.com", "password": PASSWORD})
    assert login.status_code == 401


def test_email_can_be_used_again_after_deleting(client):
    token = signup(client)
    client.post("/auth/delete-account", json={"password": PASSWORD}, headers=auth(token))
    r = client.post("/auth/signup", json={"name": "Z", "email": "zaynah@example.com", "password": PASSWORD})
    assert r.status_code == 201
    # the new account starts empty
    new_token = r.json()["access_token"]
    assert client.get("/scans", headers=auth(new_token)).json() == []


def test_deleting_one_account_leaves_others_alone(client):
    a = signup(client, "a@example.com")
    b = signup(client, "b@example.com")
    scan(client, a)
    scan(client, b)
    client.post("/auth/delete-account", json={"password": PASSWORD}, headers=auth(a))
    assert len(client.get("/scans", headers=auth(b)).json()) == 1