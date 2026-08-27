"""Backend settings, env-driven. Reads a .env file in the working directory
(ecommerce-price-tracker/, same as where run_pipeline.py is invoked from).
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+psycopg2://pricetracker:pricetracker@localhost:5433/pricetracker"
    cors_origins: str = "http://localhost:5173"
    scrape_interval_minutes: int = 60
    scrape_on_startup: bool = True
    headless: bool = True

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
