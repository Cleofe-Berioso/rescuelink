"""Rule-based abuse and spam detection for RescueLink."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.utils import timezone

from api.models import CitizenProfile, EmergencyReport
from api.services.abuse_rules import (
	RISK_EXTREME,
	RISK_HIGH,
	RISK_LOW,
	RISK_MEDIUM,
	gather_account_rule_evidence,
	gather_report_spam_rule_evidence,
)

logger = logging.getLogger(__name__)

RISK_LEVEL_MAP = {
	"low": RISK_LOW,
	"medium": RISK_MEDIUM,
	"high": RISK_HIGH,
	"extreme": RISK_EXTREME,
}


def _normalize_risk_level(value: Any, default: str = RISK_LOW) -> str:
	if not value:
		return default
	key = str(value).strip().lower()
	return RISK_LEVEL_MAP.get(key, default)


def _normalize_score(value: Any, default: int = 0) -> int:
	try:
		score = int(value)
	except (TypeError, ValueError):
		return default
	return max(0, min(100, score))


def _resolve_action(rule_score: int, strong_evidence: bool) -> str:
	if rule_score >= getattr(settings, "ABUSE_AUTO_SUSPEND_THRESHOLD", 90):
		if strong_evidence:
			return "temporary_suspend_for_review"
		return "needs_verification"
	if rule_score >= getattr(settings, "ABUSE_REVIEW_THRESHOLD", 70):
		return "needs_verification"
	return "allow"


def analyze_account_abuse(
	profile: CitizenProfile,
	*,
	client_ip: str = "",
) -> dict[str, Any]:
	rule_evidence = gather_account_rule_evidence(profile, client_ip=client_ip)
	rule_score = _normalize_score(rule_evidence["rule_score"])
	recommended = _resolve_action(rule_score, rule_evidence["strong_evidence"])

	result = {
		"risk_level": _normalize_risk_level(rule_evidence["risk_level"]),
		"risk_score": rule_score,
		"is_possible_duplicate": "duplicate" in " ".join(rule_evidence["rule_hits"]),
		"is_possible_dummy_account": "dummy" in " ".join(rule_evidence["rule_hits"]),
		"recommended_action": recommended,
		"reason": _rule_reason(rule_evidence["rule_hits"]),
		"rule_evidence": rule_evidence,
	}
	logger.info(
		"Account abuse analysis profile=%s score=%s action=%s hits=%s",
		profile.pk,
		rule_score,
		recommended,
		rule_evidence.get("rule_hits"),
	)
	return result


def analyze_report_spam(
	report: EmergencyReport,
	*,
	client_ip: str = "",
	image_hash: str = "",
) -> dict[str, Any]:
	rule_evidence = gather_report_spam_rule_evidence(
		report,
		client_ip=client_ip,
		image_hash=image_hash,
	)
	rule_score = _normalize_score(rule_evidence["rule_score"])
	recommended = _resolve_action(rule_score, rule_evidence["strong_evidence"])
	hits = rule_evidence["rule_hits"]

	is_spam = rule_score >= getattr(settings, "ABUSE_REVIEW_THRESHOLD", 70)
	is_dup_report = (
		"reused_image_hash" in hits
		or "similar_description" in hits
		or "nearby_duplicate_location" in hits
	)

	result = {
		"risk_level": _normalize_risk_level(rule_evidence["risk_level"]),
		"risk_score": rule_score,
		"is_possible_spam": is_spam,
		"is_possible_duplicate_report": is_dup_report,
		"recommended_action": recommended,
		"reason": _rule_reason(hits),
		"rule_evidence": rule_evidence,
	}
	logger.info(
		"Report spam analysis report=%s score=%s action=%s hits=%s",
		report.pk,
		rule_score,
		recommended,
		hits,
	)
	return result


def _rule_reason(hits: list[str]) -> str:
	if not hits:
		return "No suspicious patterns detected by rules."
	return "Rule-based signals: " + ", ".join(h.replace("_", " ") for h in hits)


def _flag_type_from_result(result: dict[str, Any]) -> str:
	if result.get("is_possible_spam"):
		return "SPAM"
	if result.get("is_possible_duplicate_report"):
		return "DUPLICATE_REPORT"
	return "REVIEW"


def apply_account_abuse_result(profile: CitizenProfile, result: dict[str, Any]) -> None:
	action = result.get("recommended_action", "allow")
	update_fields = ["risk_score", "risk_level", "updated_at"]

	profile.risk_score = result.get("risk_score")
	profile.risk_level = result.get("risk_level", RISK_LOW)

	if action in {"flag_for_review", "needs_verification"}:
		profile.is_flagged = True
		update_fields.append("is_flagged")

	if action == "temporary_suspend_for_review" and result["rule_evidence"].get("strong_evidence"):
		profile.is_suspended = True
		profile.suspension_reason = result.get("reason", "Temporary restriction pending admin review.")
		profile.suspension_until = timezone.now() + timedelta(hours=24)
		update_fields.extend(["is_suspended", "suspension_reason", "suspension_until"])
		logger.warning(
			"Temporary suspension applied profile=%s score=%s",
			profile.pk,
			result.get("risk_score"),
		)

	profile.save(update_fields=list(dict.fromkeys(update_fields)))


def apply_report_abuse_result(report: EmergencyReport, result: dict[str, Any]) -> None:
	action = result.get("recommended_action", "allow")
	review_threshold = getattr(settings, "ABUSE_REVIEW_THRESHOLD", 70)
	score = result.get("risk_score", 0)

	report.risk_score = score
	report.ai_review_result = {
		"rule_hits": result.get("rule_evidence", {}).get("rule_hits", []),
		"recommended_action": action,
		"source": "RULE_BASED",
	}

	update_fields = [
		"risk_score",
		"ai_review_result",
		"updated_at",
	]

	if score >= review_threshold or action in {"flag_for_review", "needs_verification", "temporary_suspend_for_review"}:
		report.is_flagged = True
		report.needs_verification = True
		report.flag_reason = result.get("reason", "")
		report.flag_type = _flag_type_from_result(result)
		update_fields.extend(["is_flagged", "needs_verification", "flag_reason", "flag_type"])

	report.save(update_fields=update_fields)

	profile = getattr(report.reporter, "citizen_profile", None)
	if (
		action == "temporary_suspend_for_review"
		and result["rule_evidence"].get("strong_evidence")
		and profile is not None
	):
		apply_account_abuse_result(
			profile,
			{
				**result,
				"recommended_action": "temporary_suspend_for_review",
				"reason": f"Linked to flagged report #{report.pk}: {result.get('reason', '')}",
			},
		)


def is_profile_suspended(profile: CitizenProfile) -> bool:
	if not profile.is_suspended:
		return False
	if profile.suspension_until and timezone.now() >= profile.suspension_until:
		profile.is_suspended = False
		profile.suspension_reason = ""
		profile.suspension_until = None
		profile.save(update_fields=["is_suspended", "suspension_reason", "suspension_until", "updated_at"])
		logger.info("Auto-unsuspended profile=%s after suspension_until", profile.pk)
		return False
	return True


def process_registration_abuse(profile: CitizenProfile, *, client_ip: str = "") -> None:
	if not getattr(settings, "MANUAL_ABUSE_REVIEW_ENABLED", True):
		return
	if client_ip:
		profile.registration_ip = client_ip
		profile.last_activity_ip = client_ip
		profile.save(update_fields=["registration_ip", "last_activity_ip", "updated_at"])
	try:
		result = analyze_account_abuse(profile, client_ip=client_ip)
		apply_account_abuse_result(profile, result)
	except Exception:
		logger.exception("Registration abuse processing failed for profile %s", profile.pk)


def process_report_abuse(
	report: EmergencyReport,
	*,
	client_ip: str = "",
	image_hash: str = "",
) -> dict[str, Any]:
	if not getattr(settings, "MANUAL_ABUSE_REVIEW_ENABLED", True):
		return {}

	if not getattr(settings, "DUPLICATE_REPORT_CHECK_ENABLED", True):
		image_hash = ""

	profile = getattr(report.reporter, "citizen_profile", None)
	if profile and client_ip:
		profile.last_activity_ip = client_ip
		profile.save(update_fields=["last_activity_ip", "updated_at"])

	try:
		result = analyze_report_spam(report, client_ip=client_ip, image_hash=image_hash)
		apply_report_abuse_result(report, result)
		return result
	except Exception:
		logger.exception("Report abuse processing failed for report %s", report.pk)
		return {}
