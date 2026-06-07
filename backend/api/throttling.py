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
