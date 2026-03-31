"""Structured logging configuration for Date Night Autopilot.

Configures structlog for JSON output to a log file. Console output
uses the same JSON format for consistency.
"""

import logging
from pathlib import Path

import structlog


def setup_logging(level: str = "INFO", log_file: str = "logs/datenight.log") -> None:
    """Configure structlog for JSON logging.

    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL).
        log_file: Path to the log file. Directory is created if missing.
    """
    log_path = Path(log_file)
    log_path.parent.mkdir(parents=True, exist_ok=True)

    log_level = getattr(logging, level.upper(), logging.INFO)

    # Reset any existing handlers to avoid duplication across calls
    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(log_level)
    root.addHandler(logging.FileHandler(log_path))

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        context_class=dict,
        logger_factory=structlog.WriteLoggerFactory(
            file=log_path.open("a"),
        ),
        cache_logger_on_first_use=False,
    )


def get_logger(name: str | None = None) -> structlog.BoundLogger:
    """Get a named structlog logger.

    Args:
        name: Logger name (appears in log output).

    Returns:
        A bound structlog logger instance.
    """
    if name:
        return structlog.get_logger(name)
    return structlog.get_logger()
