"""Environment-driven settings for the reconstruction API.

Kept intentionally small for this scaffold — just enough to back main.py's
CORS setup and give docker-compose.yml's environment block somewhere real to
land. Extend as real stage handlers need model paths, storage roots, etc.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="TOPVIEW_", env_file=".env", extra="ignore")

    cors_allow_origins: str = "*"
    log_level: str = "info"

    @property
    def cors_allow_origins_list(self) -> list[str]:
        if self.cors_allow_origins.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_allow_origins.split(",") if origin.strip()]


settings = Settings()
