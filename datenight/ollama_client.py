"""Ollama LLM client wrapper with JSON cleanup and parse-retry logic.

Wraps the ollama Python library with structured error handling,
automatic JSON cleanup (strip markdown fences), and retry logic
for Pydantic validation failures.
"""

import re
from typing import TypeVar

import httpx
import ollama
from pydantic import BaseModel, ValidationError

from datenight.logging import get_logger

logger = get_logger("ollama_client")

T = TypeVar("T", bound=BaseModel)


class OllamaConnectionError(Exception):
    """Ollama server is not running or unreachable."""


class OllamaModelNotFoundError(Exception):
    """Configured model is not available in Ollama."""


class OllamaTimeoutError(Exception):
    """LLM inference timed out."""


class ParseError(Exception):
    """JSON parse/validation failed after all retries."""


def cleanup_json(raw: str) -> str:
    """Strip markdown fences and surrounding text from LLM output.

    Handles: ```json...```, ```...```, text before first {, text after last }.
    """
    # Strip markdown code fences
    cleaned = re.sub(r"```(?:json)?\s*\n?", "", raw).strip()
    cleaned = re.sub(r"\n?```\s*$", "", cleaned).strip()

    # Extract JSON object: everything from first { to last }
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        return cleaned[start : end + 1]

    return raw.strip()


class OllamaClient:
    """Sync wrapper around the ollama Python library."""

    def __init__(self, host: str, model: str, timeout: float = 120.0) -> None:
        self._model = model
        self._client = ollama.Client(host=host, timeout=timeout)

    def generate(self, prompt: str, system: str, temperature: float) -> str:
        """Send a prompt to Ollama and return the raw response text."""
        try:
            response = self._client.generate(
                model=self._model,
                prompt=prompt,
                system=system,
                options={"temperature": temperature},
            )
            return response["response"]  # type: ignore[no-any-return]
        except httpx.ConnectError:
            raise OllamaConnectionError(
                "Ollama is not running. Start it with `ollama serve` and try again."
            )
        except httpx.TimeoutException:
            raise OllamaTimeoutError("Ollama inference timed out. Check if the model is loaded.")

    def parse_with_retry(
        self,
        prompt: str,
        system: str,
        temperature: float,
        schema: type[T],
        max_retries: int,
    ) -> T:
        """Generate and validate LLM output against a Pydantic schema.

        On validation failure, retries with error feedback up to max_retries.
        """
        current_prompt = prompt
        last_error: str = ""

        for attempt in range(max_retries):
            if attempt > 0 and last_error:
                current_prompt = (
                    f"Your previous output was invalid JSON. The error was: {last_error}\n"
                    f"Please fix and respond with ONLY a valid JSON object.\n\n"
                    f"Original request: {prompt}"
                )

            raw = self.generate(current_prompt, system, temperature)
            cleaned = cleanup_json(raw)

            try:
                return schema.model_validate_json(cleaned)
            except ValidationError as e:
                last_error = str(e)
                logger.warning(
                    "parse_retry",
                    attempt=attempt + 1,
                    max_retries=max_retries,
                    error=last_error[:200],
                )

        raise ParseError(
            f"Failed to parse valid {schema.__name__} after {max_retries} attempts. "
            f"Last error: {last_error[:200]}"
        )

    def check_health(self) -> None:
        """Verify Ollama is running and the configured model is available."""
        try:
            result = self._client.list()
        except httpx.ConnectError:
            raise OllamaConnectionError(
                "Ollama is not running. Start it with `ollama serve` and try again."
            )

        model_names = [m.get("name", "") for m in result.get("models", [])]
        if self._model not in model_names:
            raise OllamaModelNotFoundError(
                f"Model {self._model!r} not found. Pull it with `ollama pull {self._model}`."
            )
