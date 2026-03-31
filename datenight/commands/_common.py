"""Shared utilities for CLI commands."""

import functools
from typing import Any, Callable

import typer
from rich.console import Console

from datenight.api_client import ApiError

console = Console()


def handle_api_errors(func: Callable[..., Any]) -> Callable[..., Any]:
    """Decorator that catches API/connection/timeout errors and exits cleanly."""

    @functools.wraps(func)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        try:
            return func(*args, **kwargs)
        except (ApiError, ConnectionError, TimeoutError) as e:
            typer.echo(str(e), err=True)
            raise typer.Exit(1)

    return wrapper


def prompt_selection(items: list[Any], label: str) -> int:
    """Prompt user to select from a numbered list. Returns 0-based index."""
    while True:
        choice: int = typer.prompt(f"Select {label} (number)", type=int)
        if 1 <= choice <= len(items):
            return int(choice - 1)
        typer.echo(f"Invalid choice. Enter a number between 1 and {len(items)}.")
