"""Tests for datenight structured logging."""

import json
from pathlib import Path

import structlog


def test_setup_logging_creates_log_directory(tmp_path: Path):
    """Log directory is created if missing."""
    from datenight.logging import setup_logging

    log_file = tmp_path / "subdir" / "test.log"
    setup_logging(level="INFO", log_file=str(log_file))
    assert log_file.parent.exists()


def test_log_output_is_json(tmp_path: Path):
    """A log message written after setup is valid JSON."""
    from datenight.logging import setup_logging

    log_file = tmp_path / "test.log"
    setup_logging(level="INFO", log_file=str(log_file))

    logger = structlog.get_logger("test")
    logger.info("hello world")

    content = log_file.read_text().strip()
    assert content, "Log file should not be empty"
    # Parse each line as JSON
    for line in content.splitlines():
        parsed = json.loads(line)
        assert isinstance(parsed, dict)


def test_log_contains_level(tmp_path: Path):
    """JSON output includes a 'level' field."""
    from datenight.logging import setup_logging

    log_file = tmp_path / "test.log"
    setup_logging(level="INFO", log_file=str(log_file))

    logger = structlog.get_logger("test")
    logger.info("test message")

    line = log_file.read_text().strip().splitlines()[-1]
    parsed = json.loads(line)
    assert "level" in parsed
    assert parsed["level"] == "info"


def test_log_contains_timestamp(tmp_path: Path):
    """JSON output includes a 'timestamp' in ISO format."""
    from datenight.logging import setup_logging

    log_file = tmp_path / "test.log"
    setup_logging(level="INFO", log_file=str(log_file))

    logger = structlog.get_logger("test")
    logger.info("test message")

    line = log_file.read_text().strip().splitlines()[-1]
    parsed = json.loads(line)
    assert "timestamp" in parsed
    # Should be ISO-ish (contains 'T' separator)
    assert "T" in parsed["timestamp"] or "-" in parsed["timestamp"]


def test_log_contains_event(tmp_path: Path):
    """JSON output includes an 'event' field with the message."""
    from datenight.logging import setup_logging

    log_file = tmp_path / "test.log"
    setup_logging(level="INFO", log_file=str(log_file))

    logger = structlog.get_logger("test")
    logger.info("my event")

    line = log_file.read_text().strip().splitlines()[-1]
    parsed = json.loads(line)
    assert "event" in parsed
    assert parsed["event"] == "my event"


def test_get_logger_returns_bound_logger():
    """get_logger() returns a structlog BoundLogger."""
    from datenight.logging import get_logger

    logger = get_logger("test_module")
    assert logger is not None
    # Should have standard logging methods
    assert hasattr(logger, "info")
    assert hasattr(logger, "warning")
    assert hasattr(logger, "error")


def test_log_level_filtering(tmp_path: Path):
    """Setting level to WARNING suppresses INFO messages in file."""
    from datenight.logging import setup_logging

    log_file = tmp_path / "test.log"
    setup_logging(level="WARNING", log_file=str(log_file))

    logger = structlog.get_logger("test")
    logger.info("should be filtered")
    logger.warning("should appear")

    content = log_file.read_text().strip()
    lines = [l for l in content.splitlines() if l.strip()]
    # Only warning should appear
    assert len(lines) >= 1
    assert all("should be filtered" not in l for l in lines)
    assert any("should appear" in l for l in lines)
