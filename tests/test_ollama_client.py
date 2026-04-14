"""Tests for Ollama client wrapper and JSON cleanup."""

from unittest.mock import MagicMock, patch

import pytest

from datenight.ollama_client import (
    OllamaClient,
    OllamaConnectionError,
    OllamaModelNotFoundError,
    ParseError,
    cleanup_json,
)
from datenight.schemas import Phase1Plan


class TestCleanupJson:
    def test_clean_json_passthrough(self):
        raw = '{"key": "value"}'
        assert cleanup_json(raw) == '{"key": "value"}'

    def test_strips_markdown_fences(self):
        raw = '```json\n{"key": "value"}\n```'
        assert cleanup_json(raw) == '{"key": "value"}'

    def test_strips_fences_without_lang(self):
        raw = '```\n{"key": "value"}\n```'
        assert cleanup_json(raw) == '{"key": "value"}'

    def test_strips_text_before_json(self):
        raw = 'Here is the plan:\n{"key": "value"}'
        assert cleanup_json(raw) == '{"key": "value"}'

    def test_strips_text_after_json(self):
        raw = '{"key": "value"}\nHope this helps!'
        assert cleanup_json(raw) == '{"key": "value"}'

    def test_strips_both_preamble_and_postamble(self):
        raw = 'Sure thing!\n```json\n{"a": 1}\n```\nLet me know.'
        assert cleanup_json(raw) == '{"a": 1}'

    def test_no_json_returns_original(self):
        raw = "No JSON here at all"
        assert cleanup_json(raw) == "No JSON here at all"


class TestOllamaClientGenerate:
    @patch("datenight.ollama_client.ollama.Client")
    def test_generate_returns_response_text(self, mock_client_cls: MagicMock):
        mock_instance = MagicMock()
        mock_instance.generate.return_value = {"response": '{"plan": "test"}'}
        mock_client_cls.return_value = mock_instance

        client = OllamaClient(host="http://localhost:11434", model="llama3.1:8b")
        result = client.generate("prompt", "system", temperature=0.8)
        assert result == '{"plan": "test"}'
        mock_instance.generate.assert_called_once()

    @patch("datenight.ollama_client.ollama.Client")
    def test_connection_error(self, mock_client_cls: MagicMock):
        import httpx

        mock_instance = MagicMock()
        mock_instance.generate.side_effect = httpx.ConnectError("Connection refused")
        mock_client_cls.return_value = mock_instance

        client = OllamaClient(host="http://localhost:11434", model="test")
        with pytest.raises(OllamaConnectionError, match="not running"):
            client.generate("prompt", "system", temperature=0.5)


class TestParseWithRetry:
    @patch("datenight.ollama_client.ollama.Client")
    def test_valid_json_first_try(self, mock_client_cls: MagicMock):
        import json

        valid_plan = json.dumps(
            {
                "date_type": "casual",
                "theme": "Chill",
                "reasoning": "Relaxed",
                "stops": [
                    {
                        "order": 1,
                        "venue_id": "R1",
                        "time": "7 PM",
                        "duration_min": 60,
                        "why": "Nice",
                    },
                ],
            }
        )
        mock_instance = MagicMock()
        mock_instance.generate.return_value = {"response": valid_plan}
        mock_client_cls.return_value = mock_instance

        client = OllamaClient(host="http://localhost:11434", model="test")
        result = client.parse_with_retry("prompt", "system", 0.8, Phase1Plan, max_retries=3)
        assert result.date_type == "casual"
        assert mock_instance.generate.call_count == 1

    @patch("datenight.ollama_client.ollama.Client")
    def test_retry_on_invalid_then_valid(self, mock_client_cls: MagicMock):
        import json

        valid_plan = json.dumps(
            {
                "date_type": "active",
                "theme": "Sporty",
                "reasoning": "Fun",
                "stops": [
                    {"order": 1, "venue_id": "A1", "time": "6 PM", "duration_min": 90, "why": "Go"},
                ],
            }
        )
        mock_instance = MagicMock()
        mock_instance.generate.side_effect = [
            {"response": "not valid json {{{"},
            {"response": valid_plan},
        ]
        mock_client_cls.return_value = mock_instance

        client = OllamaClient(host="http://localhost:11434", model="test")
        result = client.parse_with_retry("prompt", "system", 0.8, Phase1Plan, max_retries=3)
        assert result.date_type == "active"
        assert mock_instance.generate.call_count == 2

    @patch("datenight.ollama_client.ollama.Client")
    def test_parse_error_after_max_retries(self, mock_client_cls: MagicMock):
        mock_instance = MagicMock()
        mock_instance.generate.return_value = {"response": "garbage"}
        mock_client_cls.return_value = mock_instance

        client = OllamaClient(host="http://localhost:11434", model="test")
        with pytest.raises(ParseError):
            client.parse_with_retry("prompt", "system", 0.8, Phase1Plan, max_retries=2)
        assert mock_instance.generate.call_count == 2


class TestCheckHealth:
    @patch("datenight.ollama_client.ollama.Client")
    def test_healthy(self, mock_client_cls: MagicMock):
        mock_instance = MagicMock()
        mock_instance.list.return_value = {"models": [{"name": "llama3.1:8b"}]}
        mock_client_cls.return_value = mock_instance

        client = OllamaClient(host="http://localhost:11434", model="llama3.1:8b")
        client.check_health()  # should not raise

    @patch("datenight.ollama_client.ollama.Client")
    def test_model_not_found(self, mock_client_cls: MagicMock):
        mock_instance = MagicMock()
        mock_instance.list.return_value = {"models": [{"name": "other:7b"}]}
        mock_client_cls.return_value = mock_instance

        client = OllamaClient(host="http://localhost:11434", model="llama3.1:8b")
        with pytest.raises(OllamaModelNotFoundError, match="llama3.1:8b"):
            client.check_health()

    @patch("datenight.ollama_client.ollama.Client")
    def test_ollama_not_running(self, mock_client_cls: MagicMock):
        import httpx

        mock_instance = MagicMock()
        mock_instance.list.side_effect = httpx.ConnectError("refused")
        mock_client_cls.return_value = mock_instance

        client = OllamaClient(host="http://localhost:11434", model="test")
        with pytest.raises(OllamaConnectionError, match="not running"):
            client.check_health()
