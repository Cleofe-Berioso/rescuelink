from .models import EmergencyReport

STATUS_ORDER = {
	EmergencyReport.STATUS_PENDING: 0,
	EmergencyReport.STATUS_VIEWED: 1,
	EmergencyReport.STATUS_ACCEPTED: 2,
	EmergencyReport.STATUS_DISPATCHED: 3,
	EmergencyReport.STATUS_IN_PROGRESS: 4,
	EmergencyReport.STATUS_RESOLVED: 5,
	EmergencyReport.STATUS_CANCELLED: 5,
}

TERMINAL_STATUSES = {
	EmergencyReport.STATUS_RESOLVED,
	EmergencyReport.STATUS_CANCELLED,
}

RESPOND_BLOCKED_STATUSES = TERMINAL_STATUSES

ACCEPTABLE_RESPOND_UPGRADE_FROM = {
	EmergencyReport.STATUS_PENDING,
	EmergencyReport.STATUS_VIEWED,
}


def status_rank(status):
	return STATUS_ORDER.get(status, -1)


def can_accept_respond(report_status):
	if report_status in RESPOND_BLOCKED_STATUSES:
		if report_status == EmergencyReport.STATUS_RESOLVED:
			return False, "Cannot accept or respond to a resolved report."
		return False, "Cannot accept or respond to a cancelled report."
	return True, ""


def status_after_unit_accept(current_status):
	if current_status in ACCEPTABLE_RESPOND_UPGRADE_FROM:
		return EmergencyReport.STATUS_ACCEPTED
	return current_status


def validate_status_transition(current_status, new_status):
	valid_statuses = set(STATUS_ORDER.keys())
	if new_status not in valid_statuses:
		return False, "Invalid status."

	if current_status not in valid_statuses:
		return False, "Report has an invalid current status."

	if current_status in TERMINAL_STATUSES:
		return False, f"Cannot change status of a {current_status.lower()} report."

	if new_status == current_status:
		return True, ""

	current_rank = status_rank(current_status)
	new_rank = status_rank(new_status)

	if new_status in TERMINAL_STATUSES:
		return True, ""

	if new_rank < current_rank:
		return (
			False,
			f"Invalid status transition from {current_status} to {new_status}. "
			"Backward status changes are not allowed.",
		)

	return True, ""
