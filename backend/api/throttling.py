from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    scope = "login"


class RegistrationRateThrottle(AnonRateThrottle):
    scope = "registration"


class ReportCreateRateThrottle(UserRateThrottle):
    scope = "report_create"


class ImageUploadRateThrottle(UserRateThrottle):
    scope = "image_upload"


class StaffActionRateThrottle(UserRateThrottle):
    scope = "staff_action"


class AdminActionRateThrottle(UserRateThrottle):
    scope = "admin_action"


# OTP throttles — applied to anonymous OTP request/verify endpoints
class OTPRequestRateThrottle(AnonRateThrottle):
    """Limit OTP send requests to 5 per hour per IP to prevent email abuse."""
    scope = "otp_request"


class OTPVerifyRateThrottle(AnonRateThrottle):
    """Limit OTP verification attempts to 10 per hour per IP."""
    scope = "otp_verify"
