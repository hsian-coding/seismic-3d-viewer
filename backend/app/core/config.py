from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "TECTON Seismic Data API"
    api_prefix: str = "/api/v1"
    data_dir: Path = BACKEND_DIR / "data" / "catalogs"
    cors_origins: str = "http://localhost:4173,http://127.0.0.1:4173"
    arrow_batch_size: int = 65_536
    default_event_limit: int = 250_000
    max_event_limit: int = 1_000_000

    model_config = SettingsConfigDict(env_prefix="TECTON_", env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
