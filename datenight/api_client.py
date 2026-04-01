"""HTTP client for communicating with the DateNight Cloudflare Worker.

All CLI-to-Worker communication goes through DateNightClient. Errors are
mapped to typed exceptions for clean handling in CLI commands.
"""

from typing import Any

import httpx

from datenight.config import load_settings


class ApiError(Exception):
    """Base exception for API errors."""


class AuthError(ApiError):
    """401 — invalid or missing auth token."""


class NotFoundError(ApiError):
    """404 — resource not found."""


class ConflictError(ApiError):
    """409 — resource conflict (duplicate, constraint violation)."""


class ServerError(ApiError):
    """500 — server-side error."""


class DateNightClient:
    """Sync HTTP client for the DateNight Worker API."""

    def __init__(self, base_url: str, auth_token: str, timeout: float = 30.0) -> None:
        self._base_url = base_url
        self._auth_token = auth_token
        self._client = httpx.Client(
            base_url=base_url,
            headers={"Authorization": f"Bearer {auth_token}"},
            timeout=timeout,
        )

    def close(self) -> None:
        """Close the underlying HTTP connection pool."""
        self._client.close()

    def __enter__(self) -> "DateNightClient":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()

    def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        try:
            response = self._client.request(method, path, **kwargs)
        except httpx.ConnectError:
            raise ConnectionError(
                f"Can't reach the Cloudflare Worker at {self._base_url}. "
                "Check your internet connection and Worker deployment."
            )
        except httpx.TimeoutException:
            raise TimeoutError(
                f"Request to {self._base_url}{path} timed out. "
                "Try again or increase timeout in config."
            )
        return self._handle_response(response)

    def _handle_response(self, response: httpx.Response) -> httpx.Response:
        if response.is_success:
            return response
        try:
            body = response.json()
            msg = body.get("error", response.text)
        except Exception:
            msg = response.text
        if response.status_code == 401:
            raise AuthError(
                "Authentication failed. Check your DATENIGHT_AUTH_TOKEN environment variable."
            )
        if response.status_code == 404:
            raise NotFoundError(msg)
        if response.status_code == 409:
            raise ConflictError(msg)
        if response.status_code >= 500:
            raise ServerError(f"Database error: {msg}")
        raise ApiError(f"API error ({response.status_code}): {msg}")

    # --- Profile methods ---

    def create_profile(self, data: dict[str, Any]) -> dict[str, Any]:
        resp = self._request("POST", "/api/profiles", json=data)
        return resp.json()  # type: ignore[no-any-return]

    def list_profiles(self) -> list[dict[str, Any]]:
        resp = self._request("GET", "/api/profiles")
        return resp.json()["profiles"]  # type: ignore[no-any-return]

    def get_profile(self, profile_id: str) -> dict[str, Any]:
        resp = self._request("GET", f"/api/profiles/{profile_id}")
        return resp.json()  # type: ignore[no-any-return]

    def update_profile(self, profile_id: str, data: dict[str, Any]) -> dict[str, Any]:
        resp = self._request("PUT", f"/api/profiles/{profile_id}", json=data)
        return resp.json()  # type: ignore[no-any-return]

    def delete_profile(self, profile_id: str) -> None:
        self._request("DELETE", f"/api/profiles/{profile_id}")

    # --- Couple methods ---

    def create_couple(self, data: dict[str, Any]) -> dict[str, Any]:
        resp = self._request("POST", "/api/couples", json=data)
        return resp.json()  # type: ignore[no-any-return]

    def list_couples(self) -> list[dict[str, Any]]:
        resp = self._request("GET", "/api/couples")
        return resp.json()["couples"]  # type: ignore[no-any-return]

    def get_couple(self, couple_id: str) -> dict[str, Any]:
        resp = self._request("GET", f"/api/couples/{couple_id}")
        return resp.json()  # type: ignore[no-any-return]

    def delete_couple(self, couple_id: str) -> None:
        self._request("DELETE", f"/api/couples/{couple_id}")


def get_client() -> DateNightClient:
    """Factory that reads config + env to construct a client."""
    settings = load_settings()
    return DateNightClient(
        base_url=settings.cloudflare.worker_url,
        auth_token=settings.auth_token,
    )
