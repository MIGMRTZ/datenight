"""Structured logging configuration for Date Night Autopilot.

Configures structlog for JSON output to a log file.
"""

import logging
from pathlib import Path

import structlog

# Not thread-safe — this module assumes single-threaded CLI usage.
# If parallel test execution (pytest-xdist) is needed, refactor to
# return the handle or use a context manager pattern.
_log_file_handle = None


def setup_logging(level: str = "INFO", log_file: str = "logs/datenight.log") -> None:
    """Configure structlog for JSON logging.

    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL).
        log_file: Path to the log file. Directory is created if missing.

    Raises:
        ValueError: If level is not a valid Python log level name.
    """
    global _log_file_handle

    log_path = Path(log_file)
    log_path.parent.mkdir(parents=True, exist_ok=True)

    log_level = getattr(logging, level.upper(), None)
    if log_level is None:
        raise ValueError(f"Invalid log level: {level!r}")

    # Close previous file handle to avoid leaks on repeated calls
    if _log_file_handle is not None:
        _log_file_handle.close()
    _log_file_handle = log_path.open("a")

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
        logger_factory=structlog.WriteLoggerFactory(file=_log_file_handle),
        cache_logger_on_first_use=False,
    )


def get_logger(name: str | None = None) -> structlog.BoundLogger:
    """Get a named structlog logger."""
    if name:
        return structlog.get_logger(name)  # type: ignore[no-any-return]
    return structlog.get_logger()  # type: ignore[no-any-return]
