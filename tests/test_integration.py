"""End-to-end integration test for profile/couple CLI flow.

Exercises the full user journey with respx intercepting httpx at
the transport level. No live Worker needed.
"""

import httpx
import respx
from typer.testing import CliRunner

from datenight.cli import app

runner = CliRunner()

BASE = "https://datenight-api.your-domain.workers.dev"

PROFILE_ALEX = {
    "id": "aaa-111",
    "name": "Alex",
    "cuisines": ["Italian", "Mexican"],
    "movie_genres": ["Comedy"],
    "activities": ["Bowling"],
    "dietary_restrictions": [],
    "dislikes": [],
    "created_at": "2026-03-31T00:00:00Z",
    "updated_at": "2026-03-31T00:00:00Z",
}

PROFILE_JORDAN = {
    "id": "bbb-222",
    "name": "Jordan",
    "cuisines": ["Thai"],
    "movie_genres": ["Thriller"],
    "activities": ["Hiking"],
    "dietary_restrictions": ["Vegan"],
    "dislikes": [],
    "created_at": "2026-03-31T00:00:00Z",
    "updated_at": "2026-03-31T00:00:00Z",
}

COUPLE = {
    "id": "ccc-333",
    "partner_a": PROFILE_ALEX,
    "partner_b": PROFILE_JORDAN,
    "created_at": "2026-03-31T00:00:00Z",
}


@respx.mock
def test_full_profile_couple_flow():
    """Create profiles → list → create couple → show → delete coupled (error) → unlink → delete."""
    # 1. Create profile Alex
    respx.post(f"{BASE}/api/profiles").mock(return_value=httpx.Response(201, json=PROFILE_ALEX))
    result = runner.invoke(
        app,
        ["profile", "create"],
        input="Alex\nItalian, Mexican\nComedy\nBowling\n\n\ny\n",
    )
    assert result.exit_code == 0
    assert "Alex" in result.output

    # 2. Create profile Jordan
    respx.post(f"{BASE}/api/profiles").mock(return_value=httpx.Response(201, json=PROFILE_JORDAN))
    result = runner.invoke(
        app,
        ["profile", "create"],
        input="Jordan\nThai\nThriller\nHiking\nVegan\n\ny\n",
    )
    assert result.exit_code == 0

    # 3. List profiles
    respx.get(f"{BASE}/api/profiles").mock(
        return_value=httpx.Response(200, json={"profiles": [PROFILE_ALEX, PROFILE_JORDAN]})
    )
    result = runner.invoke(app, ["profile", "list"])
    assert result.exit_code == 0
    assert "Alex" in result.output
    assert "Jordan" in result.output

    # 4. Create couple
    respx.get(f"{BASE}/api/profiles").mock(
        return_value=httpx.Response(200, json={"profiles": [PROFILE_ALEX, PROFILE_JORDAN]})
    )
    respx.post(f"{BASE}/api/couples").mock(return_value=httpx.Response(201, json=COUPLE))
    result = runner.invoke(app, ["couple", "create"], input="1\n2\ny\n")
    assert result.exit_code == 0
    assert "Couple created" in result.output

    # 5. Show couple
    respx.get(f"{BASE}/api/couples").mock(
        return_value=httpx.Response(200, json={"couples": [{"id": "ccc-333"}]})
    )
    respx.get(f"{BASE}/api/couples/ccc-333").mock(return_value=httpx.Response(200, json=COUPLE))
    result = runner.invoke(app, ["couple", "show"])
    assert result.exit_code == 0
    assert "Alex" in result.output
    assert "Jordan" in result.output

    # 6. Attempt to delete coupled profile → error
    respx.get(f"{BASE}/api/profiles/aaa-111").mock(
        return_value=httpx.Response(200, json=PROFILE_ALEX)
    )
    respx.delete(f"{BASE}/api/profiles/aaa-111").mock(
        return_value=httpx.Response(409, json={"error": "Cannot delete — partner is in a couple"})
    )
    result = runner.invoke(app, ["profile", "delete", "aaa-111"], input="y\n")
    assert result.exit_code == 1
    assert "couple" in result.output

    # 7. Unlink couple
    respx.get(f"{BASE}/api/couples").mock(
        return_value=httpx.Response(200, json={"couples": [{"id": "ccc-333"}]})
    )
    respx.get(f"{BASE}/api/couples/ccc-333").mock(return_value=httpx.Response(200, json=COUPLE))
    respx.delete(f"{BASE}/api/couples/ccc-333").mock(return_value=httpx.Response(204))
    result = runner.invoke(app, ["couple", "unlink"], input="y\n")
    assert result.exit_code == 0

    # 8. Delete both profiles
    respx.get(f"{BASE}/api/profiles/aaa-111").mock(
        return_value=httpx.Response(200, json=PROFILE_ALEX)
    )
    respx.delete(f"{BASE}/api/profiles/aaa-111").mock(return_value=httpx.Response(204))
    result = runner.invoke(app, ["profile", "delete", "aaa-111"], input="y\n")
    assert result.exit_code == 0

    respx.get(f"{BASE}/api/profiles/bbb-222").mock(
        return_value=httpx.Response(200, json=PROFILE_JORDAN)
    )
    respx.delete(f"{BASE}/api/profiles/bbb-222").mock(return_value=httpx.Response(204))
    result = runner.invoke(app, ["profile", "delete", "bbb-222"], input="y\n")
    assert result.exit_code == 0
