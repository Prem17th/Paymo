import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    PAYMO_ENV: str = "development"
    PAYMO_HOST: str = "127.0.0.1"
    PAYMO_PORT: int = 8000
    DATABASE_URL: str = "sqlite:///./paymo.db"
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # AI / LLM Configuration
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_TIMEOUT_SECONDS: float = 30.0

    # Sarvam AI Voice Configuration
    SARVAM_API_KEY: str = ""
    SARVAM_BASE_URL: str = "https://api.sarvam.ai"
    SARVAM_STT_MODEL: str = "saaras:v3"
    SARVAM_TTS_MODEL: str = "bulbul:v3"
    SARVAM_DEFAULT_SPEAKER: str = "kavya"
    SARVAM_TIMEOUT_SECONDS: float = 25.0

    # External Cashfree Integration
    CASHFREE_APP_ID: str = ""
    CASHFREE_SECRET_KEY: str = ""
    CASHFREE_ENV: str = "sandbox"
    CASHFREE_API_VERSION: str = "2023-08-01"
    CASHFREE_BASE_URL: str = "https://sandbox.cashfree.com/pg"

    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env", os.path.join(os.path.dirname(__file__), "../../.env")),
        extra="allow"
    )

settings = Settings()
