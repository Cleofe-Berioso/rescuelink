"""AI-assisted abuse detection and safe auto-actions for RescueLink."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.utils import timezone

from api.models import CitizenProfile, EmergencyReport
from api.openrouter_client import chat_json
from api.services.abuse_rules import (
	RISK_EXTREME,
	RISK_HIGH,
	RISK_LOW,
	RISK_MEDIUM,
	gather_account_rule_evidence,
	gather_report_spam_rule_evidence,
)

logger = logging.getLogger(__name__)

ACCOUNT_SYSTEM_PROMPT = """You are a fraud-risk assistant for RescueLink citizen accounts.
You receive metadata only. Never request passwords, tokens, or secrets.
Return JSON only:
{
  "risk_level": "low | medium | high | extreme",
  "risk_score": 0,
  "is_possible_duplicate": false,
  "is_possible_dummy_account": false,
  "recommended_action": "allow | flag_for_review | needs_verification | temporary_suspend_for_review",
  "reason": "short explanation"
}
Score 0-100. Be conservative; false positives harm real emergencies."""

REPORT_SPAM_SYSTEM_PROMPT = """You are a spam-risk assistant for RescueLink emergency reports.
You receive metadata only. Never delete reports. Never permanently ban users.
Return JSON only:
{
  "risk_level": "low | medium | high | extreme",
  "risk_score": 0,
  "is_possible_spam": false,
  "is_possible_duplicate_report": false,
  "recommended_action": "allow | flag_for_review | needs_verification | temporary_suspend_for_review",
  "reason": "short explanation"
}
Score 0-100. Real emergencies must not be blocked."""

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


def _combine_scores(rule_score: int, ai_score: int) -> int:
	if ai_score <= 0:
		return rule_score
	return min(100, max(rule_score, int(rule_score * 0.55 + ai_score * 0.45)))


def _resolve_action(combined_score: int, recommended_action: str, strong_evidence: bool) -> str:
	action = (recommended_action or "allow").strip().lower()
	if combined_score >= getattr(settings, "AI_AUTO_SUSPEND_THRESHOLD", 90):
		if strong_evidence:
			return "temporary_suspend_for_review"
		return "needs_verification"
	if combined_score >= getattr(settings, "AI_REVIEW_THRESHOLD", 70):
		if action in {"flag_for_review", "needs_verification", "temporary_suspend_for_review"}:
			return action
		return "needs_verification"
	return "allow"


def _account_ai_metadata(profile: CitizenProfile, rule_evidence: dict[str, Any]) -> dict[str, Any]:
	user = profile.user
	return {
		"username_length": len(user.username or ""),
		"account_age_hours": round((timezone.now() - profile.created_at).total_seconds() / 3600, 1),
		"is_verified": profile.is_verified,
		"has_home_address": bool(profile.home_address.strip()),
		"rule_hits": rule_evidence.get("rule_hits", []),
		"rule_score": rule_evidence.get("rule_score", 0),
	}


def _report_ai_metadata(report: EmergencyReport, rule_evidence: dict[str, Any]) -> dict[str, Any]:
	return {
		"description_length": len(report.emergency_description or ""),
		"has_address_text": bool(report.address_text),
		"has_image": bool(report.image),
		"rule_hits": rule_evidence.get("rule_hits", []),
		"rule_score": rule_evidence.get("rule_score", 0),
	}


def _call_abuse_ai(system_prompt: str, metadata: dict[str, Any]) -> dict[str, Any] | None:
	if not getattr(settings, "AI_ABUSE_DETECTION_ENABLED", True):
		return None
	if not getattr(settings, "OPENROUTER_API_KEY", ""):
		return None

	messages = [
		{"role": "system", "content": system_prompt},
		{"role": "user", "content": f"Analyze this safe metadata JSON:\n{metadata}"},
	]
	return chat_json(messages)


def analyze_account_abuse(
	profile: CitizenProfile,
	*,
	client_ip: str = "",
) -> dict[str, Any]:
	rule_evidence = gather_account_rule_evidence(profile, client_ip=client_ip)
	ai_data = None
	try:
		ai_data = _call_abuse_ai(ACCOUNT_SYSTEM_PROMPT, _account_ai_metadata(profile, rule_evidence))
	except Exception:
		logger.exception("Account abuse AI call failed for profile %s", profile.pk)

	ai_score = _normalize_score(ai_data.get("risk_score") if ai_data else 0)
	combined_score = _combine_scores(rule_evidence["rule_score"], ai_score)
	risk_level = _normalize_risk_level(ai_data.get("risk_level") if ai_data else rule_evidence["risk_level"])
	recommended = _resolve_action(
		combined_score,
		str(ai_data.get("recommended_action") if ai_data else "allow"),
		rule_evidence["strong_evidence"],
	)

	result = {
		"risk_level": risk_level,
		"risk_score": combined_score,
		"is_possible_duplicate": bool(ai_data.get("is_possible_duplicate")) if ai_data else "duplicate" in " ".join(rule_evidence["rule_hits"]),
		"is_possible_dummy_account": bool(ai_data.get("is_possible_dummy_account")) if ai_data else False,
		"recommended_action": recommended,
		"reason": str((ai_data or {}).get("reason") or _rule_reason(rule_evidence["rule_hits"]))[:2000],
		"rule_evidence": rule_evidence,
		"ai_result": ai_data or {},
	}
	logger.info(
		"Account abuse analysis profile=%s score=%s action=%s hits=%s",
		profile.pk,
		combined_score,
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
	ai_data = None
	try:
		ai_data = _call_abuse_ai(REPORT_SPAM_SYSTEM_PROMPT, _report_ai_metadata(report, rule_evidence))
	except Exception:
		logger.exception("Report spam AI call failed for report %s", report.pk)

	ai_score = _normalize_score(ai_data.get("risk_score") if ai_data else 0)
	combined_score = _combine_scores(rule_evidence["rule_score"], ai_score)
	risk_level = _normalize_risk_level(ai_data.get("risk_level") if ai_data else rule_evidence["risk_level"])
	recommended = _resolve_action(
		combined_score,
		str(ai_data.get("recommended_action") if ai_data else "allow"),
		rule_evidence["strong_evidence"],
	)

	is_spam = bool(ai_data.get("is_possible_spam")) if ai_data else combined_score >= 70
	is_dup_report = bool(ai_data.get("is_possible_duplicate_report")) if ai_data else "similar_description" in rule_evidence["rule_hits"] or "nearby_duplicate_location" in rule_evidence["rule_hits"]

	result = {
		"risk_level": risk_level,
		"risk_score": combined_score,
		"is_possible_spam": is_spam,
		"is_possible_duplicate_report": is_dup_report,
		"recommended_action": recommended,
		"reason": str((ai_data or {}).get("reason") or _rule_reason(rule_evidence["rule_hits"]))[:2000],
		"rule_evidence": rule_evidence,
		"ai_result": ai_data or {},
	}
	logger.info(
		"Report spam analysis report=%s score=%s action=%s hits=%s",
		report.pk,
		combined_score,
		recommended,
		rule_evidence.get("rule_hits"),
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
	review_threshold = getattr(settings, "AI_REVIEW_THRESHOLD", 70)
	score = result.get("risk_score", 0)

	report.risk_score = score
	report.risk_level = result.get("risk_level", RISK_LOW)
	report.ai_review_result = {
		"spam": result.get("ai_result", {}),
		"rule_hits": result.get("rule_evidence", {}).get("rule_hits", []),
		"recommended_action": action,
	}

	update_fields = [
		"risk_score",
		"risk_level",
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
