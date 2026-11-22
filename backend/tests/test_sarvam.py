import pytest
from unittest.mock import patch, MagicMock
from fastapi import HTTPException

from backend.app.core.config import settings
from backend.app.services import sarvam_service


def test_normalize_language_code():
    # Test Kannada
    assert sarvam_service.normalize_language_code("kn") == "kn-IN"
    assert sarvam_service.normalize_language_code("kn-IN") == "kn-IN"
    assert sarvam_service.normalize_language_code("kannada") == "kn-IN"

    # Test Hindi
    assert sarvam_service.normalize_language_code("hi") == "hi-IN"
    assert sarvam_service.normalize_language_code("hi-IN") == "hi-IN"
    assert sarvam_service.normalize_language_code("hindi") == "hi-IN"

    # Test English
    assert sarvam_service.normalize_language_code("en") == "en-IN"
    assert sarvam_service.normalize_language_code("en-IN") == "en-IN"
    assert sarvam_service.normalize_language_code("english") == "en-IN"

    # Fallback default
    assert sarvam_service.normalize_language_code("unknown") == "en-IN"


def test_sarvam_status_unconfigured(client):
    with patch.object(settings, "SARVAM_API_KEY", ""):
        res = sarvam_service.check_sarvam_availability()
        assert res["configured"] is False
        assert res["reachable"] is False
        assert res["status"] == "NOT_CONFIGURED"

        # Test endpoint
        resp = client.get("/api/voice/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["configured"] is False
        assert data["status"] == "NOT_CONFIGURED"


def test_sarvam_status_configured_and_reachable():
    with patch.object(settings, "SARVAM_API_KEY", "test_sarvam_sub_key_12345"):
        mock_resp = MagicMock()
        mock_resp.status_code = 200

        with patch("httpx.Client.get", return_value=mock_resp):
            res = sarvam_service.check_sarvam_availability()
            assert res["configured"] is True
            assert res["reachable"] is True
            assert res["status"] == "REACHABLE"
            assert "saaras" in res["stt_model"]
            assert "bulbul" in res["tts_model"]


def test_transcribe_audio_missing_key_honesty(client):
    with patch.object(settings, "SARVAM_API_KEY", ""):
        with pytest.raises(HTTPException) as excinfo:
            sarvam_service.transcribe_audio(b"dummy_wav_bytes", "test.wav", "audio/wav", "kn-IN")
        assert excinfo.value.status_code == 503
        assert "not configured" in excinfo.value.detail.lower()

        # Check endpoint fails honestly, never faking success
        resp = client.post(
            "/api/voice/transcribe",
            files={"file": ("test.wav", b"fake audio content", "audio/wav")},
            data={"language_code": "kn-IN"}
        )
        assert resp.status_code == 503
        assert "not configured" in resp.json()["detail"].lower()


def test_transcribe_audio_mocked_success(client):
    with patch.object(settings, "SARVAM_API_KEY", "test_sarvam_sub_key_12345"):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "transcript": "ನನ್ನ ₹2499 ಹಣ ಕಡಿತಗೊಂಡಿದೆ ಆದರೆ ಆದೇಶ ಖಚಿತವಾಗಿಲ್ಲ",
            "language_code": "kn-IN"
        }

        with patch("httpx.Client.post", return_value=mock_resp):
            res = sarvam_service.transcribe_audio(
                file_bytes=b"sample_audio_binary_bytes",
                filename="kannada_sample.wav",
                content_type="audio/wav",
                language_code="kn-IN"
            )
            assert res["success"] is True
            assert res["language_code"] == "kn-IN"
            assert "2499" in res["transcript"]
            assert res["provider"] == "SARVAM_AI"

            # Check endpoint
            resp = client.post(
                "/api/voice/transcribe",
                files={"file": ("kannada_sample.wav", b"sample_audio_binary_bytes", "audio/wav")},
                data={"language_code": "kn-IN"}
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["success"] is True
            assert data["language_code"] == "kn-IN"
            assert "2499" in data["transcript"]


def test_synthesize_speech_missing_key_honesty(client):
    with patch.object(settings, "SARVAM_API_KEY", ""):
        with pytest.raises(HTTPException) as excinfo:
            sarvam_service.synthesize_speech("Payment failed", "hi-IN")
        assert excinfo.value.status_code == 503
        assert "not configured" in excinfo.value.detail.lower()

        # Check endpoint
        resp = client.post(
            "/api/voice/synthesize",
            json={"text": "भुगतान विफल हो गया है", "language_code": "hi-IN"}
        )
        assert resp.status_code == 503
        assert "not configured" in resp.json()["detail"].lower()


def test_synthesize_speech_mocked_success(client):
    with patch.object(settings, "SARVAM_API_KEY", "test_sarvam_sub_key_12345"):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "audios": ["UklGRi4AAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="]
        }

        with patch("httpx.Client.post", return_value=mock_resp):
            res = sarvam_service.synthesize_speech(
                text="आपके ₹2499 के भुगतान की जांच की जा रही है",
                language_code="hi-IN"
            )
            assert res["success"] is True
            assert res["language_code"] == "hi-IN"
            assert res["speaker"] in ["kavya", "meera"]
            assert res["audio_base64"] != ""

            # Check endpoint
            resp = client.post(
                "/api/voice/synthesize",
                json={
                    "text": "आपके ₹2499 के भुगतान की जांच की जा रही है",
                    "language_code": "hi-IN"
                }
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["success"] is True
            assert data["language_code"] == "hi-IN"
            assert len(data["audio_base64"]) > 10
