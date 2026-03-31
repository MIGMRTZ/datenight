"""Tests for datenight CLI entry point."""

from datenight import __version__
from datenight.cli import app
from typer.testing import CliRunner

runner = CliRunner()


def test_version_flag():
    """datenight --version prints version and exits 0."""
    result = runner.invoke(app, ["--version"])
    assert result.exit_code == 0
    assert f"datenight {__version__}" in result.output


def test_version_short_flag():
    """datenight -V prints version and exits 0."""
    result = runner.invoke(app, ["-V"])
    assert result.exit_code == 0
    assert f"datenight {__version__}" in result.output


def test_no_args_shows_help():
    """datenight with no args shows help text."""
    result = runner.invoke(app, [])
    # Typer/Click returns exit code 0 or 2 for help display
    assert result.exit_code in (0, 2)
    assert "Date Night Autopilot" in result.output


def test_help_flag():
    """datenight --help shows help text."""
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0
    assert "--version" in result.output
    assert "--help" in result.output


def test_unknown_command_errors():
    """datenight nonexistent exits with error."""
    result = runner.invoke(app, ["nonexistent"])
    assert result.exit_code != 0
