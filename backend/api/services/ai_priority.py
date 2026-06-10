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
	"fire",
	"explosion",
	"trapped",
	"unconscious",
	"drowning",
	"severe bleeding",
	"gunshot",
	"stabbing",
	"walang malay",
	"lubog",
	"shooting",
	"collapsed",
	"naipit",
]

HIGH_KEYWORDS = [
	"accident",
	"injury",
	"flood",
	"landslide",
	"smoke",
	"chest pain",
	"sunog",
	"aksidente",
	"bangga",
	"injured",
	"nasugatan",
	"bleeding",
	"dugo",
	"baha",
	"crash",
	"rescue",
]

MEDIUM_KEYWORDS = [
	"stranded",
	"minor injury",
	"assistance needed",
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
Analyze the citizen emergency report description (any language, dialect, slang, mixed text or local languages) and optional incident photo.
Classify priority and criticality for decision-support. Do NOT dispatch units. Do NOT identify people. Do NOT diagnose medically.
Do NOT invent facts not visible or stated.

Return JSON only matching this exact schema:
{
  "priority": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "criticality": "NON_CRITICAL" | "URGENT" | "LIFE_THREATENING",
  "incident_category": "FIRE" | "MEDICAL" | "ACCIDENT" | "FLOOD" | "CRIME" | "RESCUE" | "OTHER",
  "confidence": number from 0 to 1,
  "reason": "short explanation",
  "recommended_units": ["DRRM", "BFP", "POLICE"]
}
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


def _normalize_confidence_to_pct(value: Any) -> int:
	try:
		val = float(value)
		if val <= 1.0:
			return max(0, min(100, int(val * 100)))
		else:
			return max(0, min(100, int(val)))
	except (TypeError, ValueError):
		return 50


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

	# Defaults
	priority = "LOW"
	criticality = "NON_CRITICAL"
	incident_category = "OTHER"
	confidence = 50
	recommended_units = []

	# Check category hints
	if _keyword_match(lowered, ["fire", "smoke", "sunog", "explosion", "burning", "flame"]):
		incident_category = "FIRE"
	elif _keyword_match(lowered, ["drown", "drowning", "flood", "baha", "lubog", "landslide"]):
		incident_category = "FLOOD"
	elif _keyword_match(lowered, ["gunshot", "stabbing", "shooting", "crime", "robbery", "assault", "fight", "police"]):
		incident_category = "CRIME"
	elif _keyword_match(lowered, ["accident", "crash", "aksidente", "bangga", "collision"]):
		incident_category = "ACCIDENT"
	elif _keyword_match(lowered, ["trapped", "rescue", "collapsed", "naipit"]):
		incident_category = "RESCUE"
	elif _keyword_match(lowered, ["unconscious", "bleeding", "injury", "injured", "pain", "medical", "walang malay"]):
		incident_category = "MEDICAL"

	if any(kw in lowered for kw in CRITICAL_KEYWORDS):
		priority = "CRITICAL"
		criticality = "LIFE_THREATENING"
		confidence = 70
	elif any(kw in lowered for kw in HIGH_KEYWORDS):
		priority = "HIGH"
		criticality = "URGENT"
		confidence = 65
	elif any(kw in lowered for kw in MEDIUM_KEYWORDS):
		priority = "MEDIUM"
		criticality = "URGENT"
		confidence = 60
	else:
		priority = "LOW"
		criticality = "NON_CRITICAL"
		confidence = 50

	# Infer recommended units
	if incident_category == "FIRE":
		recommended_units = ["BFP"]
	elif incident_category == "CRIME":
		recommended_units = ["POLICE"]
	elif incident_category in ["FLOOD", "RESCUE"]:
		recommended_units = ["DRRM"]
	elif incident_category == "ACCIDENT":
		recommended_units = ["DRRM", "POLICE"]
	elif incident_category == "MEDICAL":
		recommended_units = ["DRRM"]
	else:
		recommended_units = _infer_units_from_text(lowered)

	matched = [kw for kw in ALL_PRIORITY_KEYWORDS if kw in lowered]
	if matched:
		reason = f"Keyword fallback matched urgency terms: {', '.join(matched[:3])}."
	else:
		reason = "No urgent keywords detected. Defaulting to low priority fallback."

	return {
		"priority": priority,
		"criticality": criticality,
		"incident_category": incident_category,
		"confidence": confidence,
		"reason": reason,
		"recommended_units": recommended_units,
		"source": "RULE_BASED_FALLBACK",

		# Legacy fields for backward compatibility
		"is_priority": priority in ("HIGH", "CRITICAL") or criticality in ("URGENT", "LIFE_THREATENING"),
		"priority_level": priority,
		"critical_level": "CRITICAL" if criticality == "LIFE_THREATENING" else ("HIGH" if criticality == "URGENT" else "LOW"),
		"detected_incident_type": incident_category.lower(),
		"suggested_units": recommended_units,
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
	confidence_pct = _normalize_confidence_to_pct(confidence)
	level_scores = {
		"LOW": 20,
		"MEDIUM": 45,
		"HIGH": 75,
		"CRITICAL": 95,
	}
	base_score = level_scores.get(str(result.get("priority", "LOW")).upper(), 20)
	# Blend base score and confidence
	return int((base_score * 0.7) + (confidence_pct * 0.3))


def _call_openrouter(messages: list[dict[str, Any]], use_vision: bool) -> dict[str, Any] | None:
	result = chat_json(messages)
	if result is None and use_vision:
		logger.info("OpenRouter vision request failed; caller may retry text-only")
	return result


def _call_openai(messages: list[dict[str, Any]], use_vision: bool) -> dict[str, Any] | None:
	api_key = getattr(settings, "OPENAI_API_KEY", "")
	model = getattr(settings, "OPENAI_MODEL", "gpt-4.1-mini")
	if not api_key:
		logger.warning("OpenAI API key is missing.")
		return None

	try:
		from openai import OpenAI
	except ImportError:
		logger.error("Failed to import openai library.")
		return None

	try:
		client = OpenAI(api_key=api_key)
		timeout = getattr(settings, "AI_PRIORITY_TIMEOUT_SECONDS", 10)

		# Strict JSON Schema Structured Output
		response_format = {
			"type": "json_schema",
			"json_schema": {
				"name": "incident_priority_schema",
				"strict": True,
				"schema": {
					"type": "object",
					"properties": {
						"priority": {
							"type": "string",
							"enum": ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
						},
						"criticality": {
							"type": "string",
							"enum": ["NON_CRITICAL", "URGENT", "LIFE_THREATENING"]
						},
						"incident_category": {
							"type": "string",
							"enum": ["FIRE", "MEDICAL", "ACCIDENT", "FLOOD", "CRIME", "RESCUE", "OTHER"]
						},
						"confidence": {
							"type": "number"
						},
						"reason": {
							"type": "string"
						},
						"recommended_units": {
							"type": "array",
							"items": {
								"type": "string",
								"enum": ["DRRM", "BFP", "POLICE"]
							}
						}
					},
					"required": [
						"priority",
						"criticality",
						"incident_category",
						"confidence",
						"reason",
						"recommended_units"
					],
					"additionalProperties": False
				}
			}
		}

		response = client.chat.completions.create(
			model=model,
			messages=messages,
			response_format=response_format,
			timeout=timeout,
		)
		content = response.choices[0].message.content
		if not content:
			return None
		return json.loads(content)
	except Exception as exc:
		logger.warning("OpenAI API call failed or timed out: %s", exc)
		if use_vision:
			logger.info("OpenAI vision request failed; caller may retry text-only")
		return None


def analyze_report_priority(report: EmergencyReport) -> dict[str, Any]:
	if not getattr(settings, "AI_PRIORITY_ENABLED", True):
		logger.info("AI Priority analysis is disabled.")
		return keyword_fallback_analysis(report.emergency_description, report.address_text)

	provider = getattr(settings, "AI_PROVIDER", "openai").lower()
	api_key = getattr(settings, f"{provider.upper()}_API_KEY", "")
	if not api_key:
		logger.info("API Key for %s is missing. Using fallback rule engine.", provider)
		return keyword_fallback_analysis(report.emergency_description, report.address_text)

	user_prompt = _build_user_prompt(report)
	image_data_url = None
	if getattr(settings, "AI_PRIORITY_IMAGE_ANALYSIS", False):
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
	source_label = provider.upper()

	if provider == "openai":
		if image_data_url:
			ai_data = _call_openai(messages_with_vision, use_vision=True)
		if ai_data is None:
			ai_data = _call_openai(messages_text_only, use_vision=False)
	else:
		# Fall back to OpenRouter
		if image_data_url:
			ai_data = _call_openrouter(messages_with_vision, use_vision=True)
		if ai_data is None:
			ai_data = _call_openrouter(messages_text_only, use_vision=False)

	if ai_data is None:
		logger.warning("AI provider (%s) returned null or failed. Using fallback.", provider)
		fallback = keyword_fallback_analysis(report.emergency_description, report.address_text)
		return fallback

	# Map & Normalize the structured output
	try:
		# Handle OpenRouter output mapped from legacy if it returned legacy structure
		priority = ai_data.get("priority")
		if not priority and "priority_level" in ai_data:
			priority = ai_data.get("priority_level")

		criticality = ai_data.get("criticality")
		if not criticality and "critical_level" in ai_data:
			crit = str(ai_data.get("critical_level", "")).upper()
			if crit == "CRITICAL":
				criticality = "LIFE_THREATENING"
			elif crit in ("HIGH", "MEDIUM"):
				criticality = "URGENT"
			else:
				criticality = "NON_CRITICAL"

		incident_category = ai_data.get("incident_category")
		if not incident_category and "detected_incident_type" in ai_data:
			itype = str(ai_data.get("detected_incident_type", "")).lower()
			if "fire" in itype or "sunog" in itype:
				incident_category = "FIRE"
			elif "accident" in itype or "aksidente" in itype or "bangga" in itype or "crash" in itype:
				incident_category = "ACCIDENT"
			elif "flood" in itype or "baha" in itype:
				incident_category = "FLOOD"
			elif "drown" in itype or "lubog" in itype:
				incident_category = "FLOOD"
			elif "crime" in itype or "shoot" in itype or "stab" in itype or "police" in itype:
				incident_category = "CRIME"
			elif "rescue" in itype or "trap" in itype or "collapse" in itype:
				incident_category = "RESCUE"
			elif "medical" in itype or "unconscious" in itype or "bleeding" in itype or "injury" in itype:
				incident_category = "MEDICAL"
			else:
				incident_category = "OTHER"

		reason = ai_data.get("reason")
		if not reason and "ai_priority_reason" in ai_data:
			reason = ai_data.get("ai_priority_reason")

		rec_units = ai_data.get("recommended_units")
		if not rec_units and "suggested_units" in ai_data:
			rec_units = ai_data.get("suggested_units")

		normalized_result = {
			"priority": str(priority or "LOW").upper(),
			"criticality": str(criticality or "NON_CRITICAL").upper(),
			"incident_category": str(incident_category or "OTHER").upper(),
			"confidence": _normalize_confidence_to_pct(ai_data.get("confidence", 50)),
			"reason": str(reason or "").strip()[:2000],
			"recommended_units": _normalize_units(rec_units),
			"source": source_label,

			# Legacy fields for backward compatibility
			"is_priority": str(priority or "LOW").upper() in ("HIGH", "CRITICAL") or str(criticality or "NON_CRITICAL").upper() in ("URGENT", "LIFE_THREATENING"),
			"priority_level": str(priority or "LOW").upper(),
			"critical_level": "CRITICAL" if str(criticality or "NON_CRITICAL").upper() == "LIFE_THREATENING" else ("HIGH" if str(criticality or "NON_CRITICAL").upper() == "URGENT" else "LOW"),
			"detected_incident_type": str(incident_category or "OTHER").lower(),
			"suggested_units": _normalize_units(rec_units),
			"analysis_status": EmergencyReport.AI_STATUS_ANALYZED,
		}
		return normalized_result
	except Exception as exc:
		logger.exception("Failed to parse and map AI response schema: %s", exc)
		fallback = keyword_fallback_analysis(report.emergency_description, report.address_text)
		return fallback


def apply_ai_priority_to_report(report: EmergencyReport) -> None:
	try:
		result = analyze_report_priority(report)
	except Exception as exc:
		logger.exception("AI priority analysis crashed for report %s: %s", report.pk, exc)
		result = keyword_fallback_analysis(report.emergency_description, report.address_text)

	# Update new dedicated fields
	report.ai_priority = str(result.get("priority", "LOW")).upper()
	report.ai_criticality = str(result.get("criticality", "NON_CRITICAL")).upper()
	report.ai_incident_category = str(result.get("incident_category", "OTHER")).upper()
	report.ai_reason = str(result.get("reason", ""))
	report.ai_source = str(result.get("source", "RULE_BASED_FALLBACK"))
	report.ai_confidence = _normalize_confidence_to_pct(result.get("confidence", 50))
	report.suggested_units = _normalize_units(result.get("recommended_units", []))

	# Update legacy fields for backward compatibility
	report.priority_level = _normalize_level(report.ai_priority)
	
	# Map criticality to critical_level
	if report.ai_criticality == "LIFE_THREATENING":
		report.critical_level = "CRITICAL"
	elif report.ai_criticality == "URGENT":
		report.critical_level = "HIGH"
	else:
		report.critical_level = "LOW"

	report.ai_priority_reason = report.ai_reason
	report.detected_incident_type = report.ai_incident_category.lower()
	report.is_priority = report.ai_priority in ("HIGH", "CRITICAL") or report.ai_criticality in ("URGENT", "LIFE_THREATENING")
	report.priority_score = _priority_score_from_result(result)
	report.ai_analyzed_at = timezone.now()

	# Map status
	if report.ai_source == "RULE_BASED_FALLBACK":
		report.ai_analysis_status = EmergencyReport.AI_STATUS_FALLBACK
	else:
		report.ai_analysis_status = EmergencyReport.AI_STATUS_ANALYZED

	report.save(
		update_fields=[
			"ai_priority",
			"ai_criticality",
			"ai_incident_category",
			"ai_reason",
			"ai_source",
			"ai_confidence",
			"suggested_units",
			"priority_level",
			"critical_level",
			"ai_priority_reason",
			"detected_incident_type",
			"is_priority",
			"priority_score",
			"ai_analyzed_at",
			"ai_analysis_status",
			"updated_at",
		]
	)
	logger.info(
		"Successfully applied AI incident priority to report %s using source %s.",
		report.pk,
		report.ai_source,
	)
