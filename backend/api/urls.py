from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    CitizenRegisterView,
    ChangePasswordView,
    CitizenProfileView,
    EmergencyReportViewSet,
    IncidentResponseViewSet,
    IncidentStatusHistoryViewSet,
    RescueLinkTokenObtainPairView,
    RequestRegisterOTPView,
    VerifyRegisterOTPView,
    RequestPasswordResetOTPView,
    ResetPasswordWithOTPView,
    health,
)
from .admin_views import EmergencyCategoryViewSet, StaffUserViewSet
from .admin_abuse_views import CitizenAdminViewSet, FlaggedReportAdminViewSet

router = DefaultRouter()
router.register("reports", EmergencyReportViewSet, basename="reports")
router.register("responses", IncidentResponseViewSet, basename="responses")
router.register("status-history", IncidentStatusHistoryViewSet, basename="status-history")
router.register("admin/users", StaffUserViewSet, basename="admin-users")
router.register("admin/categories", EmergencyCategoryViewSet, basename="admin-categories")
router.register("admin/citizens", CitizenAdminViewSet, basename="admin-citizens")
router.register("admin/flagged-reports", FlaggedReportAdminViewSet, basename="admin-flagged-reports")

urlpatterns = [
    path("health/", health, name="health"),
    # JWT authentication (unchanged)
    path("auth/token/", RescueLinkTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    # Registration — OTP-gated
    path("auth/request-register-otp/", RequestRegisterOTPView.as_view(), name="auth_request_register_otp"),
    path("auth/verify-register-otp/", VerifyRegisterOTPView.as_view(), name="auth_verify_register_otp"),
    path("auth/register/", CitizenRegisterView.as_view(), name="auth_register"),
    # Forgot Password — OTP-based
    path("auth/request-password-reset-otp/", RequestPasswordResetOTPView.as_view(), name="auth_request_password_reset_otp"),
    path("auth/reset-password-with-otp/", ResetPasswordWithOTPView.as_view(), name="auth_reset_password_with_otp"),
    # Profile
    path("profile/", CitizenProfileView.as_view(), name="profile"),
    path("profile/change-password/", ChangePasswordView.as_view(), name="profile-change-password"),
    path("", include(router.urls)),
]
