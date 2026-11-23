"""
Tests for the C2PA check. Run from the backend folder (venv active):
    pytest tests -v

Needs these 3 files in backend/tests/fixtures/:
    C.jpg, es256_certs.pem, es256_private.key
"""
import json
from pathlib import Path

import pytest

pytest.importorskip("c2pa")
PIL = pytest.importorskip("PIL.Image")

from c2pa import Builder, C2paSignerInfo, C2paSigningAlg, Signer  # noqa: E402

from app.services import c2pa_service, trust_list  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"
TEST_CERTS = FIXTURES / "es256_certs.pem"
TEST_KEY = FIXTURES / "es256_private.key"
SAMPLE = FIXTURES / "C.jpg"

pytestmark = pytest.mark.skipif(
    not (TEST_CERTS.exists() and TEST_KEY.exists() and SAMPLE.exists()),
    reason="download the fixture files into tests/fixtures first",
)

AI_SOURCE = "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"
CAMERA_SOURCE = "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture"


def _plain_jpeg(path: Path) -> Path:
    img = PIL.new("RGB", (64, 64), (200, 120, 40))
    img.save(path, "JPEG")
    return path


def _sign(src: Path, dst: Path, actions):
    manifest = {
        "claim_generator_info": [{"name": "Test Generator", "version": "1"}],
        "assertions": [{"label": "c2pa.actions.v2", "data": {"actions": actions}}],
    }
    info = C2paSignerInfo(C2paSigningAlg.ES256, TEST_CERTS.read_bytes(), TEST_KEY.read_bytes(), None)
    with Signer.from_info(info) as signer, Builder(manifest) as builder:
        with open(src, "rb") as s, open(dst, "wb+") as d:
            builder.sign(signer, "image/jpeg", s, d)
    return dst


@pytest.fixture
def trusting_test_cert(tmp_path, monkeypatch):
    """Make the checker trust the test certificate."""
    anchors = tmp_path / "anchors.pem"
    anchors.write_text(TEST_CERTS.read_text())
    monkeypatch.setattr(c2pa_service, "TRUST_FILE", anchors)


@pytest.fixture
def no_trust(tmp_path, monkeypatch):
    monkeypatch.setattr(c2pa_service, "TRUST_FILE", tmp_path / "missing.pem")


def test_absent_when_file_has_no_credentials(tmp_path, no_trust):
    result = c2pa_service.check_c2pa(str(_plain_jpeg(tmp_path / "plain.jpg")))
    assert result["status"] == "absent"
    assert result["actions"] == [] and result["ai_generated"] is False


def test_valid_and_trusted_when_signer_is_on_the_list(tmp_path, trusting_test_cert):
    signed = _sign(_plain_jpeg(tmp_path / "a.jpg"), tmp_path / "signed.jpg",
                   [{"action": "c2pa.created", "digitalSourceType": AI_SOURCE},
                    {"action": "c2pa.converted"}])
    result = c2pa_service.check_c2pa(str(signed))
    assert result["status"] == "valid"
    assert result["trusted"] is True
    assert result["ai_generated"] is True
    assert result["actions"] == ["Created", "Format converted"]
    assert result["tool"] == "Test Generator"


def test_valid_but_not_trusted_without_a_trust_list(no_trust):
    result = c2pa_service.check_c2pa(str(SAMPLE))
    assert result["status"] == "valid"
    assert result["trusted"] is False
    assert any("untrusted" in c for c in result["codes"])


def test_invalid_when_pixels_are_tampered_with(tmp_path, trusting_test_cert):
    signed = _sign(_plain_jpeg(tmp_path / "a.jpg"), tmp_path / "signed.jpg",
                   [{"action": "c2pa.created", "digitalSourceType": CAMERA_SOURCE}])
    data = bytearray(signed.read_bytes())
    # change one byte of picture data (after the start-of-scan marker), keeping the file readable
    sos = data.rfind(b"\xff\xda")
    pos = sos + 30
    while data[pos] == 0xFF or data[pos - 1] == 0xFF:
        pos += 1
    data[pos] ^= 0x01
    tampered = tmp_path / "tampered.jpg"
    tampered.write_bytes(bytes(data))
    result = c2pa_service.check_c2pa(str(tampered))
    assert result["status"] == "invalid"


def test_unverified_when_only_the_certificate_is_rejected(monkeypatch):
    fake = {
        "active_manifest": "m1",
        "manifests": {"m1": {
            "claim_generator_info": [{"name": "Some AI Tool"}],
            "signature_info": {"issuer": "Some Company"},
            "assertions": [],
        }},
        "validation_status": [{"code": "signingCredential.untrusted"},
                              {"code": "signingCredential.invalid"}],
    }
    monkeypatch.setattr(c2pa_service, "_read_manifest_json", lambda p: json.dumps(fake))
    result = c2pa_service.check_c2pa("whatever.jpg")
    assert result["status"] == "unverified"
    assert result["signer"] == "Some Company"
    assert "signingCredential.invalid" in result["codes"]


def test_invalid_when_manifest_reports_a_content_mismatch(monkeypatch):
    fake = {
        "active_manifest": "m1",
        "manifests": {"m1": {"assertions": []}},
        "validation_status": [{"code": "assertion.dataHash.mismatch"}],
    }
    monkeypatch.setattr(c2pa_service, "_read_manifest_json", lambda p: json.dumps(fake))
    assert c2pa_service.check_c2pa("whatever.jpg")["status"] == "invalid"


def test_trust_list_refresh_keeps_old_file_when_download_fails(tmp_path):
    path = tmp_path / "anchors.pem"
    path.write_text("OLD")

    def boom(url):
        raise OSError("offline")

    assert trust_list.refresh(path=path, download=boom) == 0
    assert path.read_text() == "OLD"


def test_trust_list_refresh_writes_new_file(tmp_path):
    cert = "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----"
    path = tmp_path / "anchors.pem"
    assert trust_list.refresh(path=path, sources=[("x", "u")], download=lambda u: cert + "\n" + cert) == 1
    assert cert in path.read_text()


def test_trust_list_staleness(tmp_path):
    path = tmp_path / "anchors.pem"
    assert trust_list.is_stale(path) is True            # missing
    path.write_text("x")
    assert trust_list.is_stale(path) is False           # fresh
    assert trust_list.is_stale(path, max_age_days=-1) is True