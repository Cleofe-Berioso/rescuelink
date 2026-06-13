"""Rule-based incident triage and manual responder risk overrides."""

from __future__ import annotations

import logging
from typing import Any

from django.conf import settings
from django.contrib.auth.models import User

from api.models import EmergencyReport, ReportRiskLog
from api.serializers import get_user_role

logger = logging.getLogger(__name__)

RISK_SOURCE_RULE_BASED = "RULE_BASED"
RISK_SOURCE_MANUAL = "MANUAL_RESPONDER"

VALID_RISK_LEVELS = {
	EmergencyReport.LEVEL_LOW,
	EmergencyReport.LEVEL_MEDIUM,
	EmergencyReport.LEVEL_HIGH,
	EmergencyReport.LEVEL_CRITICAL,
}

CRITICAL_KEYWORDS = [
	"fire",
	"accident",
	"injured",
	"injury",
	"trapped",
	"flood",
	"drowning",
	"unconscious",
	"bleeding",
	"violence",
	"explosion",
	"collapsed",
	"emergency",
	"sunog",
	"baha",
	"naipit",
	"lubog",
]

HIGH_KEYWORDS = [
	"urgent",
	"rescue",
	"danger",
	"stranded",
	"missing",
	"severe",
	"smoke",
	"landslide",
	"chest pain",
]

MEDIUM_KEYWORDS = [
	"lost pet",
	"found pet",
	"minor issue",
	"minor injury",
	"assistance needed",
	"lost",
]

INITIAL_TRIAGE_REASON = (
	"Initial triage based on incident type, severity, and report keywords."
)


def _keyword_match(text: str, keywords: list[str]) -> bool:
	lowered = text.lower()
	return any(keyword in lowered for keyword in keywords)


def _severity_level_value(level: str | None) -> str:
	return (level or EmergencyReport.LEVEL_LOW).upper()


def classify_initial_risk(report: EmergencyReport) -> dict[str, Any]:
	description = report.emergency_description or ""
	address = report.address_text or ""
	text = f"{description} {address}".strip()

	critical_level = _severity_level_value(report.critical_level)
	priority_level = _severity_level_value(report.priority_level)

	risk_level = EmergencyReport.LEVEL_LOW

	if _keyword_match(text, MEDIUM_KEYWORDS):
		risk_level = EmergencyReport.LEVEL_MEDIUM
	elif critical_level == EmergencyReport.LEVEL_CRITICAL or _keyword_match(text, CRITICAL_KEYWORDS):
		risk_level = EmergencyReport.LEVEL_CRITICAL
	elif (
		critical_level == EmergencyReport.LEVEL_HIGH
		or priority_level in (EmergencyReport.LEVEL_HIGH, EmergencyReport.LEVEL_CRITICAL)
		or _keyword_match(text, HIGH_KEYWORDS)
	):
		risk_level = EmergencyReport.LEVEL_HIGH
	elif (
		critical_level == EmergencyReport.LEVEL_MEDIUM
		or priority_level == EmergencyReport.LEVEL_MEDIUM
	):
		risk_level = EmergencyReport.LEVEL_MEDIUM

	return {
		"risk_level": risk_level,
		"risk_source": RISK_SOURCE_RULE_BASED,
		"risk_reason": INITIAL_TRIAGE_REASON,
	}


def _sync_legacy_priority_fields(report: EmergencyReport, risk_level: str) -> None:
	report.risk_level = risk_level
	report.priority_level = risk_level
	if risk_level == EmergencyReport.LEVEL_CRITICAL:
		report.critical_level = EmergencyReport.LEVEL_CRITICAL
	elif risk_level == EmergencyReport.LEVEL_HIGH:
		report.critical_level = EmergencyReport.LEVEL_HIGH
	elif risk_level == EmergencyReport.LEVEL_MEDIUM:
		report.critical_level = EmergencyReport.LEVEL_MEDIUM
	else:
		report.critical_level = EmergencyReport.LEVEL_LOW
	report.is_priority = risk_level in (
		EmergencyReport.LEVEL_HIGH,
		EmergencyReport.LEVEL_CRITICAL,
	)


def apply_initial_triage(report: EmergencyReport) -> None:
	if not getattr(settings, "RULE_BASED_TRIAGE_ENABLED", True):
		return

	result = classify_initial_risk(report)
	report.risk_source = result["risk_source"]
	report.risk_reason = result["risk_reason"]
	_sync_legacy_priority_fields(report, result["risk_level"])

	report.save(
		update_fields=[
			"risk_level",
			"risk_source",
			"risk_reason",
			"priority_level",
			"critical_level",
			"is_priority",
			"updated_at",
		]
	)
	logger.info(
		"Applied rule-based triage to report %s risk_level=%s",
		report.pk,
		report.risk_level,
	)


def validate_manual_risk_change(risk_level: str, reason: str) -> tuple[bool, str]:
	normalized = (risk_level or "").upper()
	if normalized not in VALID_RISK_LEVELS:
		return False, "Invalid risk_level. Use LOW, MEDIUM, HIGH, or CRITICAL."
	if normalized in (EmergencyReport.LEVEL_HIGH, EmergencyReport.LEVEL_CRITICAL):
		if not (reason or "").strip():
			return False, "A reason is required when setting risk level to HIGH or CRITICAL."
	return True, ""


def apply_manual_risk_override(
	report: EmergencyReport,
	user: User,
	risk_level: str,
	reason: str,
) -> ReportRiskLog:
	valid, error = validate_manual_risk_change(risk_level, reason)
	if not valid:
		raise ValueError(error)

	normalized = risk_level.upper()
	old_level = report.risk_level or EmergencyReport.LEVEL_LOW
	role = get_user_role(user)
	trimmed_reason = (reason or "").strip()

	report.risk_level = normalized
	report.risk_source = RISK_SOURCE_MANUAL
	report.risk_reason = trimmed_reason or f"Risk level updated to {normalized} by {role}."
	_sync_legacy_priority_fields(report, normalized)

	report.save(
		update_fields=[
			"risk_level",
			"risk_source",
			"risk_reason",
			"priority_level",
			"critical_level",
			"is_priority",
			"updated_at",
		]
	)

	log_entry = ReportRiskLog.objects.create(
		report=report,
		old_risk_level=old_level,
		new_risk_level=normalized,
		changed_by=user,
		changed_by_role=role,
		reason=report.risk_reason,
	)
	logger.info(
		"Manual risk override report=%s %s→%s by=%s role=%s",
		report.pk,
		old_level,
		normalized,
		user.pk,
		role,
	)
	return log_entry
