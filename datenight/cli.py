"""CLI entry point for Date Night Autopilot."""

import typer

from datenight import __version__
from datenight.commands.profile import profile_app

app = typer.Typer(
    name="datenight",
    help="Date Night Autopilot — plan date nights from the terminal.",
    no_args_is_help=True,
)

_initialized = False


def _ensure_init() -> None:
    """Lazily load config and set up logging on first real command."""
    global _initialized
    if _initialized:
        return
    _initialized = True

    from datenight.config import load_settings
    from datenight.logging import setup_logging

    settings = load_settings()
    setup_logging(
        level=settings.logging.level,
        log_file=settings.logging.file,
    )


def _version_callback(value: bool) -> None:
    if value:
        typer.echo(f"datenight {__version__}")
        raise typer.Exit()


@app.callback(invoke_without_command=True)
def main(
    ctx: typer.Context,
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
    if ctx.invoked_subcommand is not None:
        _ensure_init()


app.add_typer(profile_app)
