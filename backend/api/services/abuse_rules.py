"""Rule-based evidence for account abuse and report spam detection."""

from __future__ import annotations

import hashlib
import re
from datetime import timedelta
from difflib import SequenceMatcher
from typing import Any

from django.contrib.auth import get_user_model
from django.db.models import Count
from django.utils import timezone

from api.models import CitizenProfile, EmergencyReport

User = get_user_model()

RISK_LOW = "LOW"
RISK_MEDIUM = "MEDIUM"
RISK_HIGH = "HIGH"
RISK_EXTREME = "EXTREME"

SPAM_WINDOW_MINUTES = 10
NEARBY_COORD_THRESHOLD = 0.001
SHORT_DESCRIPTION_LEN = 12


def _normalize_phone(value: str) -> str:
	digits = re.sub(r"\D", "", value or "")
	return digits[-10:] if len(digits) >= 10 else digits


def _normalize_text(value: str) -> str:
	return re.sub(r"\s+", " ", (value or "").strip().lower())


def _similar(a: str, b: str) -> float:
	if not a or not b:
		return 0.0
	return SequenceMatcher(None, a, b).ratio()


def _email_local_part(email: str) -> str:
	parts = (email or "").split("@", 1)
	return parts[0].lower() if parts else ""


def _name_tokens(name: str) -> set[str]:
	return {token for token in re.split(r"\W+", (name or "").lower()) if len(token) > 2}


def _coords_near(lat1, lon1, lat2, lon2, threshold: float = NEARBY_COORD_THRESHOLD) -> bool:
	try:
		return abs(float(lat1) - float(lat2)) <= threshold and abs(float(lon1) - float(lon2)) <= threshold
	except (TypeError, ValueError):
		return False


def _rule_score_from_hits(hits: list[str]) -> int:
	return min(100, len(hits) * 18)


def _risk_level_from_score(score: int) -> str:
	if score >= 85:
		return RISK_EXTREME
	if score >= 65:
		return RISK_HIGH
	if score >= 35:
		return RISK_MEDIUM
	return RISK_LOW


def gather_account_rule_evidence(
	profile: CitizenProfile,
	*,
	client_ip: str = "",
) -> dict[str, Any]:
	user = profile.user
	hits: list[str] = []
	details: dict[str, Any] = {}

	contact_norm = _normalize_phone(profile.contact_number)
	if contact_norm:
		dup_contact = (
			CitizenProfile.objects.filter(contact_number__icontains=contact_norm[-7:])
			.exclude(pk=profile.pk)
			.count()
		)
		if dup_contact:
			hits.append("duplicate_contact_number")
			details["duplicate_contact_count"] = dup_contact

	if profile.home_address.strip():
		dup_address = (
			CitizenProfile.objects.filter(home_address__iexact=profile.home_address.strip())
			.exclude(pk=profile.pk)
			.count()
		)
		if dup_address:
			hits.append("duplicate_address")
			details["duplicate_address_count"] = dup_address

	name_tokens = _name_tokens(profile.full_name or user.get_full_name())
	if name_tokens:
		for other in CitizenProfile.objects.exclude(pk=profile.pk).select_related("user")[:200]:
			other_tokens = _name_tokens(other.full_name or other.user.get_full_name())
			overlap = name_tokens & other_tokens
			if len(overlap) >= 2:
				hits.append("similar_name")
				details["similar_name_match"] = other.user.username
				break

	email_local = _email_local_part(user.email)
	if email_local:
		similar_emails = User.objects.filter(email__icontains=email_local).exclude(pk=user.pk).count()
		if similar_emails:
			hits.append("similar_email_pattern")
			details["similar_email_count"] = similar_emails

	ip = (client_ip or profile.registration_ip or profile.last_activity_ip or "").strip()
	if ip:
		since = timezone.now() - timedelta(hours=24)
		same_ip_count = CitizenProfile.objects.filter(
			registration_ip=ip,
			created_at__gte=since,
		).exclude(pk=profile.pk).count()
		if same_ip_count >= 2:
			hits.append("many_accounts_same_ip")
			details["same_ip_account_count"] = same_ip_count + 1

	account_age = timezone.now() - profile.created_at
	if account_age <= timedelta(hours=1):
		recent_reports = EmergencyReport.objects.filter(
			reporter=user,
			created_at__gte=timezone.now() - timedelta(hours=1),
		).count()
		if recent_reports >= 3:
			hits.append("new_account_many_reports")
			details["recent_report_count"] = recent_reports

	rule_score = _rule_score_from_hits(hits)
	strong_evidence = len(hits) >= 3 or rule_score >= 54

	return {
		"rule_hits": hits,
		"rule_score": rule_score,
		"strong_evidence": strong_evidence,
		"risk_level": _risk_level_from_score(rule_score),
		"details": details,
	}


def gather_report_spam_rule_evidence(
	report: EmergencyReport,
	*,
	client_ip: str = "",
	image_hash: str = "",
) -> dict[str, Any]:
	user = report.reporter
	hits: list[str] = []
	details: dict[str, Any] = {}
	now = timezone.now()
	window_start = now - timedelta(minutes=SPAM_WINDOW_MINUTES)

	recent_user_reports = EmergencyReport.objects.filter(
		reporter=user,
		created_at__gte=window_start,
	).exclude(pk=report.pk)
	recent_count = recent_user_reports.count()
	if recent_count >= 2:
		hits.append("too_many_reports_same_user")
		details["recent_user_report_count"] = recent_count + 1

	ip = (client_ip or "").strip()
	if ip:
		ip_reports = EmergencyReport.objects.filter(
			reporter__citizen_profile__last_activity_ip=ip,
			created_at__gte=window_start,
		).exclude(pk=report.pk).count()
		if ip_reports >= 3:
			hits.append("too_many_reports_same_ip")
			details["recent_ip_report_count"] = ip_reports + 1

	desc_norm = _normalize_text(report.emergency_description)
	if len(desc_norm) < SHORT_DESCRIPTION_LEN:
		hits.append("very_short_description")
	elif desc_norm in {"test", "hello", "asdf", "123", "spam", "fake"}:
		hits.append("nonsense_description")

	for prior in recent_user_reports[:20]:
		prior_desc = _normalize_text(prior.emergency_description)
		if _similar(desc_norm, prior_desc) >= 0.88:
			hits.append("similar_description")
			details["similar_report_id"] = prior.pk
			break
		if _coords_near(report.latitude, report.longitude, prior.latitude, prior.longitude):
			hits.append("nearby_duplicate_location")
			details["nearby_report_id"] = prior.pk
			break

	try:
		profile = user.citizen_profile
	except CitizenProfile.DoesNotExist:
		profile = None

	if profile:
		if not profile.is_verified and (now - profile.created_at) <= timedelta(days=7):
			hits.append("unverified_new_account")
		if profile.is_flagged:
			hits.append("flagged_account")

	if image_hash:
		dup_image = EmergencyReport.objects.filter(
			image_content_hash=image_hash,
		).exclude(pk=report.pk).exists()
		if dup_image:
			hits.append("reused_image_hash")
			details["reused_image"] = True

	rule_score = _rule_score_from_hits(hits)
	strong_evidence = len(hits) >= 3 or (
		len(hits) >= 2 and any(h in hits for h in ("too_many_reports_same_user", "similar_description"))
	)

	return {
		"rule_hits": hits,
		"rule_score": rule_score,
		"strong_evidence": strong_evidence,
		"risk_level": _risk_level_from_score(rule_score),
		"details": details,
	}


def compute_image_content_hash(image_bytes: bytes) -> str:
	return hashlib.sha256(image_bytes).hexdigest()
