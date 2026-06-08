import base64
import json
import logging
import re
from typing import Any

from django.conf import settings
from django.utils import timezone

from api.models import EmergencyReport
from api.openrouter_client import chat_json
from api.storage import download_emergency_photo

logger = logging.getLogger(__name__)
VALID_LEVELS = {
	EmergencyReport.LEVEL_LOW,
	EmergencyReport.LEVEL_MEDIUM,
	EmergencyReport.LEVEL_HIGH,
	EmergencyReport.LEVEL_CRITICAL,
}
VALID_UNITS = {"DRRM", "BFP", "POLICE"}

CRITICAL_KEYWORDS = [
	"unconscious",
	"walang malay",
	"drowning",
	"lubog",
	"explosion",
	"shooting",
	"stabbing",
	"collapsed",
	"landslide",
	"trapped",
	"naipit",
]

HIGH_KEYWORDS = [
	"fire",
	"sunog",
	"accident",
	"aksidente",
	"bangga",
	"injured",
	"nasugatan",
	"bleeding",
	"dugo",
	"flood",
	"baha",
	"crash",
	"rescue",
]

MEDIUM_KEYWORDS = [
	"emergency",
	"urgent",
]

ALL_PRIORITY_KEYWORDS = CRITICAL_KEYWORDS + HIGH_KEYWORDS + MEDIUM_KEYWORDS

UNIT_KEYWORD_HINTS = {
	"DRRM": [
		"flood",
		"baha",
		"landslide",
		"earthquake",
		"trapped",
		"naipit",
		"rescue",
		"collapse",
		"collapsed",
		"drown",
		"drowning",
		"lubog",
		"typhoon",
		"disaster",
		"accident",
		"aksidente",
		"bangga",
		"crash",
	],
	"BFP": [
		"fire",
		"sunog",
		"smoke",
		"burn",
		"burning",
		"explosion",
		"flame",
		"gas leak",
	],
	"POLICE": [
		"shooting",
		"stabbing",
		"violence",
		"crime",
		"robbery",
		"assault",
		"fight",
		"traffic",
		"accident",
		"aksidente",
		"bangga",
		"crash",
	],
}

SYSTEM_PROMPT = """You are an emergency triage assistant for RescueLink.
Analyze the citizen emergency report description (any language, dialect, slang, or mixed text) and optional incident photo.
Classify urgency only. Do NOT dispatch units. Do NOT identify people. Do NOT diagnose medically.
Do NOT invent facts not visible or stated.

Return JSON only with this exact schema:
{
  "is_priority": true,
  "priority_level": "HIGH",
  "critical_level": "HIGH",
  "detected_incident_type": "road accident",
  "suggested_units": ["DRRM", "POLICE"],
  "reason": "Brief explanation of urgency signals.",
  "confidence": 85
}

Rules:
- priority_level and critical_level must be one of: LOW, MEDIUM, HIGH, CRITICAL
- suggested_units must be a subset of: DRRM, BFP, POLICE
- confidence is an integer 0-100
- is_priority should be true when priority_level is HIGH or CRITICAL, or critical_level is HIGH or CRITICAL
- LOW: non-urgent, unclear, minor, no visible danger
- MEDIUM: needs attention but no obvious immediate life threat
- HIGH: strong emergency indicator (injury, accident, fire, flood, urgent rescue)
- CRITICAL: possible life-threatening (severe injury, trapped/unconscious, active fire, explosion, drowning, major crash)
- If the image is unclear, note uncertainty in reason and lower confidence
"""


def _normalize_level(value: Any, default: str = EmergencyReport.LEVEL_LOW) -> str:
	if not value:
		return default
	level = str(value).strip().upper()
	if level not in VALID_LEVELS:
		return default
	return level


def _normalize_units(units: Any) -> list[str]:
	if not isinstance(units, list):
		return []
	normalized = []
	for unit in units:
		unit_value = str(unit).strip().upper()
		if unit_value in VALID_UNITS and unit_value not in normalized:
			normalized.append(unit_value)
	return normalized


def _normalize_confidence(value: Any) -> int | None:
	try:
		confidence = int(value)
	except (TypeError, ValueError):
		return None
	return max(0, min(100, confidence))


def _keyword_match(text: str, keywords: list[str]) -> bool:
	lowered = text.lower()
	return any(keyword in lowered for keyword in keywords)


def _infer_units_from_text(text: str) -> list[str]:
	units = []
	for unit, keywords in UNIT_KEYWORD_HINTS.items():
		if _keyword_match(text, keywords):
			units.append(unit)
	return units


def keyword_fallback_analysis(description: str, address_text: str = "") -> dict[str, Any]:
	text = f"{description or ''} {address_text or ''}".strip()
	lowered = text.lower()

	if not lowered:
		return {
			"is_priority": False,
			"priority_level": EmergencyReport.LEVEL_LOW,
			"critical_level": EmergencyReport.LEVEL_LOW,
			"detected_incident_type": "",
			"suggested_units": [],
			"reason": "No description provided; classified as low priority using keyword fallback.",
			"confidence": 30,
			"analysis_status": EmergencyReport.AI_STATUS_FALLBACK,
		}

	critical_level = EmergencyReport.LEVEL_LOW
	priority_level = EmergencyReport.LEVEL_LOW

	if _keyword_match(lowered, CRITICAL_KEYWORDS):
		critical_level = EmergencyReport.LEVEL_CRITICAL
		priority_level = EmergencyReport.LEVEL_CRITICAL
	elif _keyword_match(lowered, HIGH_KEYWORDS):
		critical_level = EmergencyReport.LEVEL_HIGH
		priority_level = EmergencyReport.LEVEL_HIGH
	elif _keyword_match(lowered, MEDIUM_KEYWORDS):
		critical_level = EmergencyReport.LEVEL_MEDIUM
		priority_level = EmergencyReport.LEVEL_MEDIUM

	is_priority = priority_level in (
		EmergencyReport.LEVEL_HIGH,
		EmergencyReport.LEVEL_CRITICAL,
	) or critical_level in (
		EmergencyReport.LEVEL_HIGH,
		EmergencyReport.LEVEL_CRITICAL,
	)

	matched = [kw for kw in ALL_PRIORITY_KEYWORDS if kw in lowered]
	suggested_units = _infer_units_from_text(lowered)

	if matched:
		reason = (
			f"Keyword fallback detected urgency terms ({', '.join(matched[:5])}). "
			"Manual review required."
		)
		confidence = 55 if is_priority else 40
	else:
		reason = "No urgent keywords detected; classified as low priority using keyword fallback."
		confidence = 35

	incident_type = ""
	if _keyword_match(lowered, ["fire", "sunog"]):
		incident_type = "fire"
	elif _keyword_match(lowered, ["accident", "aksidente", "bangga", "crash"]):
		incident_type = "road accident"
	elif _keyword_match(lowered, ["flood", "baha"]):
		incident_type = "flood"
	elif _keyword_match(lowered, ["drown", "lubog"]):
		incident_type = "drowning"

	return {
		"is_priority": is_priority,
		"priority_level": priority_level,
		"critical_level": critical_level,
		"detected_incident_type": incident_type,
		"suggested_units": suggested_units,
		"reason": reason,
		"confidence": confidence,
		"analysis_status": EmergencyReport.AI_STATUS_FALLBACK,
	}


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


def _normalize_ai_result(data: dict[str, Any]) -> dict[str, Any]:
	priority_level = _normalize_level(data.get("priority_level"))
	critical_level = _normalize_level(data.get("critical_level"))
	is_priority = bool(data.get("is_priority"))
	if priority_level in (EmergencyReport.LEVEL_HIGH, EmergencyReport.LEVEL_CRITICAL):
		is_priority = True
	if critical_level in (EmergencyReport.LEVEL_HIGH, EmergencyReport.LEVEL_CRITICAL):
		is_priority = True

	return {
		"is_priority": is_priority,
		"priority_level": priority_level,
		"critical_level": critical_level,
		"detected_incident_type": str(data.get("detected_incident_type") or "")[:120],
		"suggested_units": _normalize_units(data.get("suggested_units")),
		"reason": str(data.get("reason") or "").strip()[:2000],
		"confidence": _normalize_confidence(data.get("confidence")),
		"analysis_status": EmergencyReport.AI_STATUS_ANALYZED,
	}


def _build_user_prompt(report: EmergencyReport) -> str:
	parts = [
		f"Description: {report.emergency_description}",
	]
	if report.address_text:
		parts.append(f"Location text: {report.address_text}")
	if report.detected_incident_type:
		parts.append(f"Existing incident type hint: {report.detected_incident_type}")
	return "\n".join(parts)


def _load_report_image_data_url(report: EmergencyReport) -> str | None:
	if not report.image:
		return None
	try:
		body, content_type = download_emergency_photo(report.image)
	except Exception:
		logger.warning("Could not load image for AI analysis on report %s", report.pk)
		return None

	if content_type not in {"image/jpeg", "image/png", "image/webp"}:
		content_type = "image/jpeg"

	encoded = base64.b64encode(body).decode("ascii")
	return f"data:{content_type};base64,{encoded}"


def _priority_score_from_result(result: dict[str, Any]) -> int:
	confidence = result.get("confidence")
	if confidence is not None:
		return _normalize_confidence(confidence) or 0
	level_scores = {
		EmergencyReport.LEVEL_LOW: 20,
		EmergencyReport.LEVEL_MEDIUM: 45,
		EmergencyReport.LEVEL_HIGH: 75,
		EmergencyReport.LEVEL_CRITICAL: 95,
	}
	return level_scores.get(result.get("priority_level"), 20)


def _call_openrouter(messages: list[dict[str, Any]], use_vision: bool) -> dict[str, Any] | None:
	result = chat_json(messages)
	if result is None and use_vision:
		logger.info("OpenRouter vision request failed; caller may retry text-only")
	return result


def analyze_report_priority(report: EmergencyReport) -> dict[str, Any]:
	if not getattr(settings, "AI_PRIORITY_ENABLED", True):
		return keyword_fallback_analysis(report.emergency_description, report.address_text)

	api_key = getattr(settings, "OPENROUTER_API_KEY", "")
	model = getattr(settings, "OPENROUTER_MODEL", "")
	if not api_key or not model:
		return keyword_fallback_analysis(report.emergency_description, report.address_text)

	user_prompt = _build_user_prompt(report)
	image_data_url = _load_report_image_data_url(report)

	messages_with_vision = [
		{"role": "system", "content": SYSTEM_PROMPT},
		{
			"role": "user",
			"content": [
				{"type": "text", "text": user_prompt},
				{"type": "image_url", "image_url": {"url": image_data_url}},
			],
		},
	]
	messages_text_only = [
		{"role": "system", "content": SYSTEM_PROMPT},
		{"role": "user", "content": user_prompt},
	]

	ai_data = None
	if image_data_url:
		ai_data = _call_openrouter(messages_with_vision, use_vision=True)
	if ai_data is None:
		ai_data = _call_openrouter(messages_text_only, use_vision=False)

	if ai_data is None:
		fallback = keyword_fallback_analysis(report.emergency_description, report.address_text)
		fallback["analysis_status"] = EmergencyReport.AI_STATUS_FAILED
		return fallback

	try:
		return _normalize_ai_result(ai_data)
	except Exception:
		logger.exception("Failed to normalize AI priority response for report %s", report.pk)
		fallback = keyword_fallback_analysis(report.emergency_description, report.address_text)
		fallback["analysis_status"] = EmergencyReport.AI_STATUS_FAILED
		return fallback


def apply_ai_priority_to_report(report: EmergencyReport) -> None:
	try:
		result = analyze_report_priority(report)
	except Exception:
		logger.exception("AI priority analysis crashed for report %s", report.pk)
		result = keyword_fallback_analysis(report.emergency_description, report.address_text)
		result["analysis_status"] = EmergencyReport.AI_STATUS_FAILED

	report.is_priority = bool(result.get("is_priority"))
	report.priority_level = _normalize_level(result.get("priority_level"))
	report.critical_level = _normalize_level(result.get("critical_level"))
	report.ai_priority_reason = str(result.get("reason") or "")
	report.detected_incident_type = str(result.get("detected_incident_type") or "")[:120]
	report.suggested_units = _normalize_units(result.get("suggested_units"))
	report.ai_confidence = _normalize_confidence(result.get("confidence"))
	report.priority_score = _priority_score_from_result(result)
	report.ai_analyzed_at = timezone.now()
	report.ai_analysis_status = result.get(
		"analysis_status", EmergencyReport.AI_STATUS_ANALYZED
	)

	report.save(
		update_fields=[
			"is_priority",
			"priority_level",
			"critical_level",
			"ai_priority_reason",
			"detected_incident_type",
			"suggested_units",
			"ai_confidence",
			"priority_score",
			"ai_analyzed_at",
			"ai_analysis_status",
			"updated_at",
		]
	)
