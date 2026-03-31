"""CLI entry point for Date Night Autopilot."""

import typer

from datenight import __version__
from datenight.config import load_settings
from datenight.logging import setup_logging

app = typer.Typer(
    name="datenight",
    help="Date Night Autopilot — plan date nights from the terminal.",
    no_args_is_help=True,
)


def _version_callback(value: bool) -> None:
    if value:
        typer.echo(f"datenight {__version__}")
        raise typer.Exit()


@app.callback()
def main(
    version: bool = typer.Option(
        False,
        "--version",
        "-V",
        help="Show version and exit.",
        callback=_version_callback,
        is_eager=True,
    ),
) -> None:
    """Date Night Autopilot — plan date nights from the terminal."""
    settings = load_settings()
    setup_logging(
        level=settings.logging.level,
        log_file=settings.logging.file,
    )
