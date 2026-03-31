"""Tests for datenight configuration management."""

import os
from pathlib import Path

import pytest
import yaml


def test_default_settings():
    """Settings load with all defaults when no config.yaml exists."""
    from datenight.config import DateNightSettings

    settings = DateNightSettings()
    assert settings.location.zip == "75165"
    assert settings.location.city == "Waxahachie"
    assert settings.location.state == "TX"
    assert settings.location.radius_miles == 10
    assert settings.ollama.model == "llama3.1:8b"
    assert settings.ollama.host == "http://localhost:11434"
    assert settings.ollama.temperature == 0.8
    assert settings.ollama.phase2_temperature == 0.3
    assert settings.ollama.phase3_temperature == 0.2
    assert settings.ollama.timeout_seconds == 120
    assert settings.cloudflare.worker_url == "https://datenight-api.your-domain.workers.dev"
    assert settings.calendar.output_dir == "~/.datenight/calendars"
    assert settings.calendar.reminder_minutes == 30
    assert settings.planning.max_retries == 3
    assert settings.planning.max_parse_retries == 3
    assert settings.planning.min_quality_score == 7.0
    assert settings.planning.same_day_cutoff == "16:00"
    assert settings.logging.level == "INFO"
    assert settings.logging.file == "logs/datenight.log"


def test_load_from_yaml(tmp_path: Path):
    """Settings correctly read from a config.yaml file."""
    from datenight.config import load_settings

    config_data = {
        "location": {"zip": "90210", "city": "Beverly Hills", "state": "CA"},
        "ollama": {"model": "mistral:7b", "temperature": 0.5},
        "cloudflare": {"worker_url": "https://my-worker.example.com"},
    }
    config_file = tmp_path / "config.yaml"
    config_file.write_text(yaml.dump(config_data))

    settings = load_settings(config_path=config_file)
    assert settings.location.zip == "90210"
    assert settings.location.city == "Beverly Hills"
    assert settings.ollama.model == "mistral:7b"
    assert settings.ollama.temperature == 0.5
    # Unspecified values keep defaults
    assert settings.ollama.phase2_temperature == 0.3
    assert settings.cloudflare.worker_url == "https://my-worker.example.com"


def test_env_var_override(monkeypatch: pytest.MonkeyPatch):
    """DATENIGHT_AUTH_TOKEN env var populates auth_token."""
    from datenight.config import load_settings

    monkeypatch.setenv("DATENIGHT_AUTH_TOKEN", "secret-token-123")
    settings = load_settings(config_path=None)
    assert settings.auth_token == "secret-token-123"


def test_nested_env_override(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    """DATENIGHT__LOCATION__ZIP overrides location.zip."""
    from datenight.config import load_settings

    config_file = tmp_path / "config.yaml"
    config_file.write_text(yaml.dump({"location": {"zip": "75165"}}))

    monkeypatch.setenv("DATENIGHT__LOCATION__ZIP", "10001")
    settings = load_settings(config_path=config_file)
    assert settings.location.zip == "10001"


def test_missing_auth_token_is_empty(monkeypatch: pytest.MonkeyPatch):
    """Without env var, auth_token defaults to empty string."""
    from datenight.config import load_settings

    monkeypatch.delenv("DATENIGHT_AUTH_TOKEN", raising=False)
    monkeypatch.delenv("DATENIGHT__AUTH_TOKEN", raising=False)
    settings = load_settings(config_path=None)
    assert settings.auth_token == ""


def test_invalid_quality_score():
    """Pydantic validation rejects negative min_quality_score."""
    from pydantic import ValidationError

    from datenight.config import PlanningConfig

    with pytest.raises(ValidationError):
        PlanningConfig(min_quality_score=-1.0)


def test_config_yaml_not_found_uses_defaults():
    """Gracefully falls back to defaults when config.yaml doesn't exist."""
    from datenight.config import load_settings

    settings = load_settings(config_path=Path("/nonexistent/config.yaml"))
    assert settings.location.zip == "75165"
    assert settings.ollama.model == "llama3.1:8b"
