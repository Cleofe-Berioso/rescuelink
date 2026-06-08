"""HTTP request helpers for abuse detection metadata."""

from __future__ import annotations


def get_client_ip(request) -> str:
	"""Best-effort client IP from proxy headers or direct connection."""
	if request is None:
		return ""
	xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
	if xff:
		return xff.split(",")[0].strip()[:45]
	remote = request.META.get("REMOTE_ADDR", "")
	return str(remote).strip()[:45]
