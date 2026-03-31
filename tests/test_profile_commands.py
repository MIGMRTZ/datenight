"""Tests for datenight profile CLI commands."""

from unittest.mock import MagicMock, patch

from typer.testing import CliRunner

from datenight.api_client import ConflictError
from datenight.cli import app

runner = CliRunner()

SAMPLE_PROFILE = {
    "id": "p1",
    "name": "Alex",
    "cuisines": ["Italian", "Mexican"],
    "movie_genres": ["Comedy", "Thriller"],
    "activities": ["Bowling", "Hiking"],
    "dietary_restrictions": ["Vegetarian"],
    "dislikes": ["Horror movies"],
    "created_at": "2026-03-31T00:00:00Z",
    "updated_at": "2026-03-31T00:00:00Z",
}


@patch("datenight.commands.profile.get_client")
def test_profile_create(mock_get_client: MagicMock):
    mock_client = MagicMock()
    mock_client.create_profile.return_value = SAMPLE_PROFILE
    mock_get_client.return_value = mock_client

    result = runner.invoke(
        app,
        ["profile", "create"],
        input="Alex\nItalian, Mexican\nComedy, Thriller\n"
        "Bowling, Hiking\nVegetarian\nHorror movies\ny\n",
    )
    assert result.exit_code == 0
    assert "Alex" in result.output
    mock_client.create_profile.assert_called_once()


@patch("datenight.commands.profile.get_client")
def test_profile_list(mock_get_client: MagicMock):
    mock_client = MagicMock()
    mock_client.list_profiles.return_value = [SAMPLE_PROFILE]
    mock_get_client.return_value = mock_client

    result = runner.invoke(app, ["profile", "list"])
    assert result.exit_code == 0
    assert "Alex" in result.output


@patch("datenight.commands.profile.get_client")
def test_profile_list_empty(mock_get_client: MagicMock):
    mock_client = MagicMock()
    mock_client.list_profiles.return_value = []
    mock_get_client.return_value = mock_client

    result = runner.invoke(app, ["profile", "list"])
    assert result.exit_code == 0
    assert "No profiles" in result.output


@patch("datenight.commands.profile.get_client")
def test_profile_show(mock_get_client: MagicMock):
    mock_client = MagicMock()
    mock_client.get_profile.return_value = SAMPLE_PROFILE
    mock_get_client.return_value = mock_client

    result = runner.invoke(app, ["profile", "show", "p1"])
    assert result.exit_code == 0
    assert "Alex" in result.output
    assert "Italian" in result.output


@patch("datenight.commands.profile.get_client")
def test_profile_edit(mock_get_client: MagicMock):
    mock_client = MagicMock()
    mock_client.get_profile.return_value = SAMPLE_PROFILE
    mock_client.update_profile.return_value = {**SAMPLE_PROFILE, "name": "Alex Updated"}
    mock_get_client.return_value = mock_client

    result = runner.invoke(
        app,
        ["profile", "edit", "p1"],
        input="Alex Updated\nJapanese\nSci-Fi\nSwimming\nVegan\nSpiders\n",
    )
    assert result.exit_code == 0
    mock_client.update_profile.assert_called_once()


@patch("datenight.commands.profile.get_client")
def test_profile_delete(mock_get_client: MagicMock):
    mock_client = MagicMock()
    mock_client.get_profile.return_value = SAMPLE_PROFILE
    mock_get_client.return_value = mock_client

    result = runner.invoke(app, ["profile", "delete", "p1"], input="y\n")
    assert result.exit_code == 0
    mock_client.delete_profile.assert_called_once_with("p1")


@patch("datenight.commands.profile.get_client")
def test_profile_delete_coupled(mock_get_client: MagicMock):
    mock_client = MagicMock()
    mock_client.get_profile.return_value = SAMPLE_PROFILE
    mock_client.delete_profile.side_effect = ConflictError("partner is in a couple")
    mock_get_client.return_value = mock_client

    result = runner.invoke(app, ["profile", "delete", "p1"], input="y\n")
    assert result.exit_code == 1
    assert "couple" in result.output


@patch("datenight.commands.profile.get_client")
def test_profile_connection_error(mock_get_client: MagicMock):
    mock_client = MagicMock()
    mock_client.list_profiles.side_effect = ConnectionError("Can't reach")
    mock_get_client.return_value = mock_client

    result = runner.invoke(app, ["profile", "list"])
    assert result.exit_code == 1
    assert "Can't reach" in result.output
