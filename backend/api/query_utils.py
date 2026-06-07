from rest_framework.exceptions import ValidationError

from .models import EmergencyReport

REPORT_STATUS_VALUES = {choice[0] for choice in EmergencyReport.STATUS_CHOICES}
STAFF_ROLE_VALUES = {"ADMIN", "DRRM", "BFP", "POLICE"}
REPORT_ORDERING_FIELDS = {"created_at", "-created_at", "updated_at", "-updated_at", "status", "-status"}


def parse_bool_param(value):
    if value is None:
        return None
    if value.lower() in ("true", "1", "yes"):
        return True
    if value.lower() in ("false", "0", "no"):
        return False
    raise ValidationError({"detail": "Invalid boolean query parameter."})


def sanitize_search_term(value, max_length=100):
    if not value:
        return ""
    return str(value).strip()[:max_length]


def validate_report_status_filter(status_value):
    if not status_value:
        return None
    status_upper = str(status_value).strip().upper()
    if status_upper not in REPORT_STATUS_VALUES:
        raise ValidationError({"status": "Invalid status filter."})
    return status_upper


def validate_staff_role_filter(role_value):
    if not role_value:
        return None
    role_upper = str(role_value).strip().upper()
    if role_upper not in STAFF_ROLE_VALUES:
        raise ValidationError({"role": "Invalid role filter."})
    return role_upper


def validate_report_ordering(ordering_value):
    if not ordering_value:
        return None
    ordering = str(ordering_value).strip()
    if ordering not in REPORT_ORDERING_FIELDS:
        raise ValidationError({"ordering": "Invalid ordering field."})
    return ordering
