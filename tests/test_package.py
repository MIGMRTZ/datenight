"""Tests for datenight package initialization."""


def test_import_datenight():
    """Verify the datenight package can be imported."""
    import datenight

    assert datenight is not None


def test_version_is_string():
    """Verify __version__ is a string in semver format."""
    from datenight import __version__

    assert isinstance(__version__, str)
    assert __version__ == "0.1.0"
