"""Backend-only OpenRouter client. Never log or expose API keys."""

from __future__ import annotations

import json
import logging
import re
import urllib.error
import urllib.request
from typing import Any

from django.conf import settings

logger = logging.getLogger(__name__)

OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"


def _extract_json_content(raw: str) -> dict[str, Any] | None:
	text = (raw or "").strip()
	if not text:
		return None

	try:
		return json.loads(text)
	except json.JSONDecodeError:
		pass

	match = re.search(r"\{.*\}", text, re.DOTALL)
	if not match:
		return None
	try:
		return json.loads(match.group(0))
	except json.JSONDecodeError:
		return None


def _chat_completion(
	model: str,
	messages: list[dict[str, Any]],
	*,
	timeout: int | None = None,
) -> dict[str, Any] | None:
	api_key = getattr(settings, "OPENROUTER_API_KEY", "")
	if not api_key or not model:
		return None

	payload = {
		"model": model,
		"messages": messages,
		"temperature": 0.2,
		"response_format": {"type": "json_object"},
	}
	body = json.dumps(payload).encode("utf-8")
	headers = {
		"Authorization": f"Bearer {api_key}",
		"Content-Type": "application/json",
		"HTTP-Referer": getattr(settings, "OPENROUTER_SITE_URL", "http://localhost:5173"),
		"X-Title": getattr(settings, "OPENROUTER_APP_NAME", "RescueLink"),
	}

	request_timeout = timeout or getattr(settings, "AI_PRIORITY_TIMEOUT_SECONDS", 20)
	request = urllib.request.Request(
		OPENROUTER_CHAT_URL,
		data=body,
		headers=headers,
		method="POST",
	)

	try:
		with urllib.request.urlopen(request, timeout=request_timeout) as response:
			response_body = response.read().decode("utf-8")
	except urllib.error.HTTPError as exc:
		logger.warning("OpenRouter HTTP error %s for model %s", exc.code, model)
		return None
	except (urllib.error.URLError, TimeoutError) as exc:
		logger.warning("OpenRouter request failed for model %s: %s", model, exc.__class__.__name__)
		return None

	try:
		parsed = json.loads(response_body)
		content = parsed["choices"][0]["message"]["content"]
	except (KeyError, IndexError, TypeError, json.JSONDecodeError):
		logger.warning("OpenRouter returned unexpected response shape for model %s", model)
		return None

	return _extract_json_content(content)


def chat_json(
	messages: list[dict[str, Any]],
	*,
	model: str | None = None,
	fallback_model: str | None = None,
	timeout: int | None = None,
) -> dict[str, Any] | None:
	"""Call OpenRouter with main model, then fallback model if needed."""
	main_model = model or getattr(settings, "OPENROUTER_MODEL", "")
	fallback = fallback_model or getattr(settings, "OPENROUTER_FALLBACK_MODEL", "")

	result = _chat_completion(main_model, messages, timeout=timeout)
	if result is not None:
		return result

	if fallback and fallback != main_model:
		logger.info("OpenRouter main model failed; trying fallback model")
		return _chat_completion(fallback, messages, timeout=timeout)

	return None


def safety_check_json(
	messages: list[dict[str, Any]],
	*,
	timeout: int | None = None,
) -> dict[str, Any] | None:
	"""Optional content safety pass using the safety model."""
	safety_model = getattr(settings, "OPENROUTER_SAFETY_MODEL", "")
	if not safety_model:
		return None
	return _chat_completion(safety_model, messages, timeout=timeout)
