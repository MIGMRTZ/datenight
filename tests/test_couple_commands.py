"""Tests for datenight couple CLI commands."""

from unittest.mock import MagicMock, patch

from typer.testing import CliRunner

from datenight.cli import app

runner = CliRunner()

SAMPLE_PROFILES = [
    {"id": "p1", "name": "Alex", "cuisines": ["Italian"]},
    {"id": "p2", "name": "Jordan", "cuisines": ["Thai"]},
]

SAMPLE_COUPLE = {
    "id": "c1",
    "partner_a": {"id": "p1", "name": "Alex", "cuisines": ["Italian"]},
    "partner_b": {"id": "p2", "name": "Jordan", "cuisines": ["Thai"]},
    "created_at": "2026-03-31T00:00:00Z",
}


@patch("datenight.commands.couple.get_client")
def test_couple_create(mock_get_client: MagicMock):
    mock_client = MagicMock()
    mock_client.list_profiles.return_value = SAMPLE_PROFILES
    mock_client.create_couple.return_value = SAMPLE_COUPLE
    mock_get_client.return_value = mock_client

    result = runner.invoke(app, ["couple", "create"], input="1\n2\ny\n")
    assert result.exit_code == 0
    assert "Couple created" in result.output
    mock_client.create_couple.assert_called_once()


@patch("datenight.commands.couple.get_client")
def test_couple_create_too_few_profiles(mock_get_client: MagicMock):
    mock_client = MagicMock()
    mock_client.list_profiles.return_value = [SAMPLE_PROFILES[0]]
    mock_get_client.return_value = mock_client

    result = runner.invoke(app, ["couple", "create"])
    assert result.exit_code == 1
    assert "at least 2 profiles" in result.output


@patch("datenight.commands.couple.get_client")
def test_couple_show(mock_get_client: MagicMock):
    mock_client = MagicMock()
    mock_client.list_couples.return_value = [{"id": "c1"}]
    mock_client.get_couple.return_value = SAMPLE_COUPLE
    mock_get_client.return_value = mock_client

    result = runner.invoke(app, ["couple", "show"])
    assert result.exit_code == 0
    assert "Alex" in result.output
    assert "Jordan" in result.output


@patch("datenight.commands.couple.get_client")
def test_couple_show_no_couples(mock_get_client: MagicMock):
    mock_client = MagicMock()
    mock_client.list_couples.return_value = []
    mock_get_client.return_value = mock_client

    result = runner.invoke(app, ["couple", "show"])
    assert result.exit_code == 0
    assert "No couples" in result.output


@patch("datenight.commands.couple.get_client")
def test_couple_unlink(mock_get_client: MagicMock):
    mock_client = MagicMock()
    mock_client.list_couples.return_value = [{"id": "c1"}]
    mock_client.get_couple.return_value = SAMPLE_COUPLE
    mock_get_client.return_value = mock_client

    result = runner.invoke(app, ["couple", "unlink"], input="y\n")
    assert result.exit_code == 0
    mock_client.delete_couple.assert_called_once_with("c1")
    assert "unlinked" in result.output.lower() or "Unlinked" in result.output


@patch("datenight.commands.couple.get_client")
def test_couple_unlink_no_couples(mock_get_client: MagicMock):
    mock_client = MagicMock()
    mock_client.list_couples.return_value = []
    mock_get_client.return_value = mock_client

    result = runner.invoke(app, ["couple", "unlink"])
    assert result.exit_code == 0
    assert "No couples" in result.output
