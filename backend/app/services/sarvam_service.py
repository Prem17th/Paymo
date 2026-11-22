import io
import re
from typing import Dict, Any, Optional
import httpx
from fastapi import HTTPException

from backend.app.core.config import settings

# Supported BCP-47 language mappings
SARVAM_LANGUAGE_MAP = {
    "kn": "kn-IN",
    "kn-in": "kn-IN",
    "kannada": "kn-IN",
    "hi": "hi-IN",
    "hi-in": "hi-IN",
    "hindi": "hi-IN",
    "en": "en-IN",
    "en-in": "en-IN",
    "english": "en-IN",
    "ta": "ta-IN",
    "ta-in": "ta-IN",
    "tamil": "ta-IN",
    "te": "te-IN",
    "te-in": "te-IN",
    "telugu": "te-IN",
    "bn": "bn-IN",
    "bn-in": "bn-IN",
    "bengali": "bn-IN",
    "mr": "mr-IN",
    "mr-in": "mr-IN",
    "marathi": "mr-IN",
    "gu": "gu-IN",
    "gu-in": "gu-IN",
    "gujarati": "gu-IN",
}

def normalize_language_code(code: str) -> str:
    """Normalize user language code to Sarvam BCP-47 format."""
    clean = code.strip().lower()
    return SARVAM_LANGUAGE_MAP.get(clean, "en-IN")


def check_sarvam_availability() -> Dict[str, Any]:
    """
    Safely verifies whether Sarvam AI is configured and reachable without exposing the key.
    """
    api_key = settings.SARVAM_API_KEY.strip()
    if not api_key:
        return {
            "configured": False,
            "reachable": False,
            "stt_model": settings.SARVAM_STT_MODEL,
            "tts_model": settings.SARVAM_TTS_MODEL,
            "status": "NOT_CONFIGURED",
            "message": "SARVAM_API_KEY is not set in backend environment. Voice features require configuration."
        }

    try:
        # Lightweight probe to Sarvam endpoint with timeout
        with httpx.Client(timeout=4.0) as client:
            resp = client.get(
                f"{settings.SARVAM_BASE_URL}/",
                headers={"api-subscription-key": api_key}
            )
            # Sarvam root or ping response
            is_ok = resp.status_code in [200, 404, 405] # connection succeeded, not 401/403
            return {
                "configured": True,
                "reachable": is_ok,
                "stt_model": settings.SARVAM_STT_MODEL,
                "tts_model": settings.SARVAM_TTS_MODEL,
                "status": "REACHABLE" if is_ok else "AUTH_FAILED",
                "message": f"Sarvam AI is configured (STT: {settings.SARVAM_STT_MODEL}, TTS: {settings.SARVAM_TTS_MODEL})."
            }
    except Exception as e:
        return {
            "configured": True,
            "reachable": False,
            "stt_model": settings.SARVAM_STT_MODEL,
            "tts_model": settings.SARVAM_TTS_MODEL,
            "status": "UNREACHABLE",
            "message": f"Sarvam endpoint unreachable: {str(e)}"
        }


def transcribe_audio(
    file_bytes: bytes,
    filename: str = "audio.wav",
    content_type: str = "audio/wav",
    language_code: Optional[str] = None
) -> Dict[str, Any]:
    """
    Sends audio to Sarvam AI's official Speech-to-Text endpoint (POST /speech-to-text).
    Supports Kannada (kn-IN), Hindi (hi-IN), English (en-IN), etc.
    """
    api_key = settings.SARVAM_API_KEY.strip()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Sarvam STT unavailable: SARVAM_API_KEY is not configured in backend environment."
        )

    bcp47_lang = normalize_language_code(language_code) if language_code else None

    # Sarvam STT request: multipart/form-data with file, model, language_code
    url = f"{settings.SARVAM_BASE_URL}/speech-to-text"
    headers = {
        "api-subscription-key": api_key
    }

    data = {
        "model": settings.SARVAM_STT_MODEL,
        "mode": "transcribe"
    }
    if bcp47_lang:
        data["language_code"] = bcp47_lang

    files = {
        "file": (filename, io.BytesIO(file_bytes), content_type)
    }

    try:
        with httpx.Client(timeout=settings.SARVAM_TIMEOUT_SECONDS) as client:
            response = client.post(url, headers=headers, data=data, files=files)

        if response.status_code != 200:
            err_text = response.text
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Sarvam STT upstream error ({response.status_code}): {err_text}"
            )

        resp_json = response.json()
        transcript = resp_json.get("transcript", "")
        detected_lang = resp_json.get("language_code", bcp47_lang or "en-IN")

        return {
            "success": True,
            "transcript": transcript,
            "language_code": detected_lang,
            "model": settings.SARVAM_STT_MODEL,
            "provider": "SARVAM_AI"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to communicate with Sarvam STT API: {str(e)}"
        )


def synthesize_speech(
    text: str,
    language_code: str = "en-IN",
    speaker: Optional[str] = None
) -> Dict[str, Any]:
    """
    Converts text to speech using Sarvam AI's official Text-to-Speech endpoint (POST /text-to-speech).
    Returns base64-encoded audio WAV.
    """
    api_key = settings.SARVAM_API_KEY.strip()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Sarvam TTS unavailable: SARVAM_API_KEY is not configured in backend environment."
        )

    # Clean text: remove bracketed system notices, e.g. [DEMO RESPONSE]
    cleaned_text = re.sub(r'\[.*?\]', '', text).strip()
    if not cleaned_text:
        cleaned_text = text.strip()

    # Truncate to Sarvam 2500 character limit
    if len(cleaned_text) > 2400:
        cleaned_text = cleaned_text[:2400] + "..."

    bcp47_lang = normalize_language_code(language_code)
    spk = speaker or settings.SARVAM_DEFAULT_SPEAKER

    url = f"{settings.SARVAM_BASE_URL}/text-to-speech"
    headers = {
        "api-subscription-key": api_key,
        "Content-Type": "application/json"
    }

    # Bulbul v1/v2 payload standard
    payload = {
        "inputs": [cleaned_text],
        "target_language_code": bcp47_lang,
        "speaker": spk,
        "model": settings.SARVAM_TTS_MODEL
    }

    try:
        with httpx.Client(timeout=settings.SARVAM_TIMEOUT_SECONDS) as client:
            response = client.post(url, headers=headers, json=payload)

        # Fallback payload format check if target API uses text/language_code
        if response.status_code == 422:
            alt_payload = {
                "text": cleaned_text,
                "language_code": bcp47_lang,
                "speaker": spk,
                "model": settings.SARVAM_TTS_MODEL
            }
            with httpx.Client(timeout=settings.SARVAM_TIMEOUT_SECONDS) as client:
                response = client.post(url, headers=headers, json=alt_payload)

        if response.status_code != 200:
            err_text = response.text
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Sarvam TTS upstream error ({response.status_code}): {err_text}"
            )

        resp_json = response.json()
        # Sarvam returns {"audios": ["<base64_wav>"]}
        audios = resp_json.get("audios", [])
        audio_base64 = audios[0] if audios else resp_json.get("audio", "")

        if not audio_base64:
            raise HTTPException(
                status_code=502,
                detail="Sarvam TTS response did not contain audio data."
            )

        return {
            "success": True,
            "audio_base64": audio_base64,
            "audio_format": "audio/wav",
            "language_code": bcp47_lang,
            "speaker": spk,
            "model": settings.SARVAM_TTS_MODEL,
            "provider": "SARVAM_AI"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to communicate with Sarvam TTS API: {str(e)}"
        )
