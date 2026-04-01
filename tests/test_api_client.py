"""Tests for datenight API client."""

import httpx
import pytest
import respx

from datenight.api_client import (
    AuthError,
    ConflictError,
    DateNightClient,
    NotFoundError,
    ServerError,
    get_client,
)


@pytest.fixture
def client() -> DateNightClient:
    return DateNightClient(base_url="https://test-worker.dev", auth_token="test-token")


class TestProfileMethods:
    @respx.mock
    def test_create_profile(self, client: DateNightClient):
        route = respx.post("https://test-worker.dev/api/profiles").mock(
            return_value=httpx.Response(201, json={"id": "p1", "name": "Alex"})
        )
        result = client.create_profile({"id": "p1", "name": "Alex", "cuisines": ["Italian"]})
        assert result["id"] == "p1"
        assert route.called
        assert route.calls[0].request.headers["authorization"] == "Bearer test-token"

    @respx.mock
    def test_list_profiles(self, client: DateNightClient):
        respx.get("https://test-worker.dev/api/profiles").mock(
            return_value=httpx.Response(200, json={"profiles": [{"id": "p1"}, {"id": "p2"}]})
        )
        result = client.list_profiles()
        assert len(result) == 2

    @respx.mock
    def test_get_profile(self, client: DateNightClient):
        respx.get("https://test-worker.dev/api/profiles/p1").mock(
            return_value=httpx.Response(200, json={"id": "p1", "name": "Alex"})
        )
        result = client.get_profile("p1")
        assert result["name"] == "Alex"

    @respx.mock
    def test_update_profile(self, client: DateNightClient):
        respx.put("https://test-worker.dev/api/profiles/p1").mock(
            return_value=httpx.Response(200, json={"id": "p1", "name": "Updated"})
        )
        result = client.update_profile("p1", {"name": "Updated", "cuisines": ["Thai"]})
        assert result["name"] == "Updated"

    @respx.mock
    def test_delete_profile(self, client: DateNightClient):
        respx.delete("https://test-worker.dev/api/profiles/p1").mock(
            return_value=httpx.Response(204)
        )
        client.delete_profile("p1")


class TestCoupleMethods:
    @respx.mock
    def test_create_couple(self, client: DateNightClient):
        respx.post("https://test-worker.dev/api/couples").mock(
            return_value=httpx.Response(201, json={"id": "c1"})
        )
        result = client.create_couple({"id": "c1", "partner_a": "p1", "partner_b": "p2"})
        assert result["id"] == "c1"

    @respx.mock
    def test_list_couples(self, client: DateNightClient):
        respx.get("https://test-worker.dev/api/couples").mock(
            return_value=httpx.Response(200, json={"couples": [{"id": "c1"}]})
        )
        result = client.list_couples()
        assert len(result) == 1

    @respx.mock
    def test_get_couple(self, client: DateNightClient):
        respx.get("https://test-worker.dev/api/couples/c1").mock(
            return_value=httpx.Response(
                200,
                json={"id": "c1", "partner_a": {"name": "Alex"}, "partner_b": {"name": "Jordan"}},
            )
        )
        result = client.get_couple("c1")
        assert result["partner_a"]["name"] == "Alex"

    @respx.mock
    def test_delete_couple(self, client: DateNightClient):
        respx.delete("https://test-worker.dev/api/couples/c1").mock(
            return_value=httpx.Response(204)
        )
        client.delete_couple("c1")


class TestErrorHandling:
    @respx.mock
    def test_401_raises_auth_error(self, client: DateNightClient):
        respx.get("https://test-worker.dev/api/profiles").mock(
            return_value=httpx.Response(401, json={"error": "Invalid token"})
        )
        with pytest.raises(AuthError, match="Authentication failed"):
            client.list_profiles()

    @respx.mock
    def test_404_raises_not_found(self, client: DateNightClient):
        respx.get("https://test-worker.dev/api/profiles/nope").mock(
            return_value=httpx.Response(404, json={"error": "Not found"})
        )
        with pytest.raises(NotFoundError):
            client.get_profile("nope")

    @respx.mock
    def test_409_raises_conflict(self, client: DateNightClient):
        respx.post("https://test-worker.dev/api/profiles").mock(
            return_value=httpx.Response(409, json={"error": "Already exists"})
        )
        with pytest.raises(ConflictError, match="Already exists"):
            client.create_profile({"id": "dup"})

    @respx.mock
    def test_500_raises_server_error(self, client: DateNightClient):
        respx.get("https://test-worker.dev/api/profiles").mock(
            return_value=httpx.Response(500, json={"error": "DB failure"})
        )
        with pytest.raises(ServerError, match="DB failure"):
            client.list_profiles()

    @respx.mock
    def test_connection_error(self, client: DateNightClient):
        respx.get("https://test-worker.dev/api/profiles").mock(
            side_effect=httpx.ConnectError("Connection refused")
        )
        with pytest.raises(ConnectionError, match="Can't reach"):
            client.list_profiles()

    @respx.mock
    def test_timeout_error(self, client: DateNightClient):
        respx.get("https://test-worker.dev/api/profiles").mock(
            side_effect=httpx.ReadTimeout("Timed out")
        )
        with pytest.raises(TimeoutError, match="timed out"):
            client.list_profiles()


class TestGetClient:
    def test_get_client_reads_config(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("DATENIGHT_AUTH_TOKEN", "my-token")
        c = get_client()
        assert c._auth_token == "my-token"
