"""Configuration management for Date Night Autopilot.

Reads settings from config.yaml with environment variable overrides.
Auth token is env-only (DATENIGHT_AUTH_TOKEN), never stored in config files.

Priority (highest to lowest):
1. Environment variables (DATENIGHT__LOCATION__ZIP, etc.)
2. config.yaml values
3. Field defaults
"""

import os
from pathlib import Path
from typing import Any, ClassVar

import yaml
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, PydanticBaseSettingsSource, SettingsConfigDict


class LocationConfig(BaseModel):
    zip: str = "75165"
    city: str = "Waxahachie"
    state: str = "TX"
    radius_miles: int = 10


class OllamaConfig(BaseModel):
    model: str = "llama3.1:8b"
    host: str = "http://localhost:11434"
    temperature: float = 0.8
    phase2_temperature: float = 0.3
    phase3_temperature: float = 0.2
    timeout_seconds: int = 120


class CloudflareConfig(BaseModel):
    worker_url: str = "https://datenight-api.your-domain.workers.dev"


class CalendarConfig(BaseModel):
    output_dir: str = "~/.datenight/calendars"
    reminder_minutes: int = 30


class PlanningConfig(BaseModel):
    max_retries: int = 3
    max_parse_retries: int = 3
    min_quality_score: float = Field(default=7.0, ge=0.0)
    same_day_cutoff: str = "16:00"


class LoggingConfig(BaseModel):
    level: str = "INFO"
    file: str = "logs/datenight.log"


class YamlSettingsSource(PydanticBaseSettingsSource):
    """Custom settings source that reads from a YAML file."""

    def __init__(self, settings_cls: type[BaseSettings], yaml_data: dict[str, Any]):
        super().__init__(settings_cls)
        self._yaml_data = yaml_data

    def get_field_value(
        self, field: Any, field_name: str
    ) -> tuple[Any, str, bool]:
        value = self._yaml_data.get(field_name)
        return value, field_name, value is not None

    def __call__(self) -> dict[str, Any]:
        return self._yaml_data


# Module-level storage for YAML data to pass into settings_customise_sources
_yaml_data: dict[str, Any] = {}


class DateNightSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="DATENIGHT__",
        env_nested_delimiter="__",
    )

    location: LocationConfig = LocationConfig()
    ollama: OllamaConfig = OllamaConfig()
    cloudflare: CloudflareConfig = CloudflareConfig()
    calendar: CalendarConfig = CalendarConfig()
    planning: PlanningConfig = PlanningConfig()
    logging: LoggingConfig = LoggingConfig()
    auth_token: str = ""

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        # Priority: init > env > yaml > defaults
        return (
            init_settings,
            env_settings,
            YamlSettingsSource(settings_cls, _yaml_data),
        )


def load_settings(config_path: Path | None = None) -> DateNightSettings:
    """Load settings from config.yaml with env var overrides.

    Args:
        config_path: Explicit path to config.yaml. If None, searches
                     CWD and ~/.datenight/config.yaml.

    Returns:
        Fully resolved DateNightSettings instance.
    """
    global _yaml_data
    _yaml_data = {}

    if config_path is not None:
        if config_path.exists():
            _yaml_data = yaml.safe_load(config_path.read_text()) or {}
    else:
        for candidate in [Path("config.yaml"), Path.home() / ".datenight" / "config.yaml"]:
            if candidate.exists():
                _yaml_data = yaml.safe_load(candidate.read_text()) or {}
                break

    settings = DateNightSettings()

    # Support DATENIGHT_AUTH_TOKEN (single underscore) as convenience alias
    token = os.environ.get("DATENIGHT_AUTH_TOKEN", "")
    if token and not settings.auth_token:
        settings.auth_token = token

    return settings
