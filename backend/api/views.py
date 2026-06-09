import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes, throttle_classes
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import (
    CitizenProfile,
    EmergencyReport,
    IncidentResponse,
    IncidentStatusHistory,
    OTPRecord,
    generate_otp_code,
    hash_otp,
)
from .permissions import IsStaffUser
from .query_utils import validate_report_ordering, validate_report_status_filter
from .serializers import (
    CitizenProfileSerializer,
    CitizenRegisterSerializer,
    ChangePasswordSerializer,
    EmergencyReportSerializer,
    IncidentResponseSerializer,
    IncidentStatusHistorySerializer,
    RescueLinkTokenObtainPairSerializer,
)
from .storage import delete_emergency_photo, download_emergency_photo, upload_emergency_photo
from .request_utils import get_client_ip
from .services.ai_priority import apply_ai_priority_to_report
from .services.abuse_detection import is_profile_suspended, process_report_abuse
from .services.abuse_rules import compute_image_content_hash
from .report_status import (
    can_accept_respond,
    status_after_unit_accept,
    validate_status_transition,
)
from .throttling import (
    OTPRequestRateThrottle,
    OTPVerifyRateThrottle,
    RegistrationRateThrottle,
    ReportCreateRateThrottle,
    StaffActionRateThrottle,
)

UserModel = get_user_model()
security_logger = logging.getLogger("rescuelink.security")


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
@throttle_classes([])
def health(request):
	# No database queries — keep this view as lightweight as possible.
	# Render calls this endpoint frequently; throttling must never apply here.
	return Response({"ok": True, "service": "rescuelink-api"})


class RescueLinkTokenObtainPairView(TokenObtainPairView):
	serializer_class = RescueLinkTokenObtainPairSerializer
	permission_classes = [permissions.AllowAny]
	throttle_classes = []  # set in get_throttles

	def get_throttles(self):
		from .throttling import LoginRateThrottle

		return [LoginRateThrottle()]


class EmergencyReportViewSet(viewsets.ModelViewSet):
	queryset = EmergencyReport.objects.select_related("reporter").prefetch_related("responses").all()
	serializer_class = EmergencyReportSerializer
	http_method_names = ["get", "post", "head", "options"]

	def get_permissions(self):
		if self.action in ["respond", "update_status"]:
			return [permissions.IsAuthenticated(), IsStaffUser()]
		return [permissions.IsAuthenticated()]

	def get_throttles(self):
		if self.action == "create":
			return [ReportCreateRateThrottle()]
		if self.action in ("respond", "update_status"):
			return [StaffActionRateThrottle()]
		return super().get_throttles()

	def get_queryset(self):
		user = self.request.user
		queryset = EmergencyReport.objects.select_related("reporter").prefetch_related("responses").all()
		if user.is_staff:
			status_filter = validate_report_status_filter(
				self.request.query_params.get("status")
			)
			if status_filter:
				queryset = queryset.filter(status=status_filter)
			ordering = validate_report_ordering(self.request.query_params.get("ordering"))
			if ordering:
				queryset = queryset.order_by(ordering)
			return queryset
		return queryset.filter(reporter=user)

	def create(self, request, *args, **kwargs):
		profile = get_or_create_citizen_profile(request.user)
		if is_profile_suspended(profile):
			return Response(
				{
					"detail": (
						"Your account is temporarily restricted due to suspicious activity. "
						"Please contact support or wait for admin review."
					)
				},
				status=status.HTTP_403_FORBIDDEN,
			)

		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		image_file = serializer.validated_data.pop("image", None)
		client_ip = get_client_ip(request)
		image_hash = ""

		with transaction.atomic():
			report = serializer.save(reporter=request.user)
			IncidentStatusHistory.objects.create(
				emergency_report=report,
				status=EmergencyReport.STATUS_PENDING,
				updated_by=request.user,
				remarks="Emergency report submitted.",
			)

		object_key = None
		if image_file:
			try:
				image_file.seek(0)
				image_bytes = image_file.read()
				image_hash = compute_image_content_hash(image_bytes)
				image_file.seek(0)
				object_key = upload_emergency_photo(
					report.id,
					image_file,
					image_file.content_type,
					image_file.name,
				)
				report.image = object_key
				report.image_content_hash = image_hash
				report.save(update_fields=["image", "image_content_hash", "updated_at"])
			except Exception as exc:
				if object_key:
					try:
						delete_emergency_photo(object_key)
					except Exception:
						pass
				report.delete()
				raise ValidationError(
					{"image": "Failed to upload image. Please try again."}
				) from exc

		if client_ip:
			profile.last_activity_ip = client_ip
			profile.save(update_fields=["last_activity_ip", "updated_at"])

		try:
			apply_ai_priority_to_report(report)
		except Exception:
			pass

		try:
			process_report_abuse(report, client_ip=client_ip, image_hash=image_hash)
		except Exception:
			pass

		report.refresh_from_db()
		output = self.get_serializer(report)
		headers = self.get_success_headers(output.data)
		return Response(output.data, status=status.HTTP_201_CREATED, headers=headers)

	@action(detail=True, methods=["GET"], url_path="image")
	def image(self, request, pk=None):
		report = self.get_object()
		if not report.image:
			return Response({"detail": "No image for this report."}, status=status.HTTP_404_NOT_FOUND)

		try:
			body, content_type = download_emergency_photo(report.image)
		except Exception:
			return Response(
				{"detail": "Failed to retrieve image."},
				status=status.HTTP_502_BAD_GATEWAY,
			)

		return HttpResponse(body, content_type=content_type)

	@action(detail=True, methods=["POST"])
	def respond(self, request, pk=None):
		report = self.get_object()
		response_unit = request.data.get("response_unit")
		response_notes = str(request.data.get("response_notes", ""))[:2000]

		if response_unit not in [choice[0] for choice in IncidentResponse.UNIT_CHOICES]:
			return Response({"detail": "Invalid response_unit."}, status=status.HTTP_400_BAD_REQUEST)

		if IncidentResponse.objects.filter(
			emergency_report=report,
			response_unit=response_unit,
		).exists():
			return Response(
				{"detail": "This unit has already responded to this incident."},
				status=status.HTTP_400_BAD_REQUEST,
			)

		allowed, error_message = can_accept_respond(report.status)
		if not allowed:
			return Response({"detail": error_message}, status=status.HTTP_400_BAD_REQUEST)

		previous_status = report.status

		response_item = IncidentResponse.objects.create(
			emergency_report=report,
			responder_user=request.user,
			response_unit=response_unit,
			response_notes=response_notes,
			response_status="ACCEPTED",
		)

		new_status = status_after_unit_accept(previous_status)
		status_changed = new_status != previous_status

		if status_changed:
			report.status = new_status
			report.save(update_fields=["status", "updated_at"])

		remarks = f"{response_unit} accepted the incident."
		if status_changed:
			remarks += f" Report status updated from {previous_status} to {new_status}."
		else:
			remarks += f" Report status remains {report.status}."

		if response_notes:
			remarks += f" Notes: {response_notes}"

		IncidentStatusHistory.objects.create(
			emergency_report=report,
			status=report.status,
			updated_by=request.user,
			remarks=remarks,
		)

		serializer = IncidentResponseSerializer(response_item)
		return Response(
			{
				**serializer.data,
				"report_status": report.status,
				"report_status_changed": status_changed,
			},
			status=status.HTTP_201_CREATED,
		)

	@action(detail=True, methods=["POST"])
	def update_status(self, request, pk=None):
		report = self.get_object()
		new_status = request.data.get("status")
		remarks = str(request.data.get("remarks", ""))[:2000]

		valid_statuses = {choice[0] for choice in EmergencyReport.STATUS_CHOICES}
		if new_status not in valid_statuses:
			return Response({"detail": "Invalid status."}, status=status.HTTP_400_BAD_REQUEST)

		valid, error_message = validate_status_transition(report.status, new_status)
		if not valid:
			return Response({"detail": error_message}, status=status.HTTP_400_BAD_REQUEST)

		previous_status = report.status
		report.status = new_status
		report.save(update_fields=["status", "updated_at"])

		history_remarks = remarks or f"Status updated from {previous_status} to {new_status}."
		IncidentStatusHistory.objects.create(
			emergency_report=report,
			status=new_status,
			updated_by=request.user,
			remarks=history_remarks,
		)

		return Response({"id": report.id, "status": report.status, "previous_status": previous_status})


class IncidentStatusHistoryViewSet(viewsets.ReadOnlyModelViewSet):
	queryset = IncidentStatusHistory.objects.select_related("updated_by", "emergency_report").all()
	serializer_class = IncidentStatusHistorySerializer
	permission_classes = [permissions.IsAuthenticated]

	def get_queryset(self):
		queryset = super().get_queryset()
		user = self.request.user
		if user.is_staff:
			return queryset
		return queryset.filter(emergency_report__reporter=user)


class IncidentResponseViewSet(viewsets.ReadOnlyModelViewSet):
	queryset = IncidentResponse.objects.select_related("responder_user", "emergency_report").all()
	serializer_class = IncidentResponseSerializer
	permission_classes = [permissions.IsAuthenticated]

	def get_queryset(self):
		queryset = super().get_queryset()
		user = self.request.user
		if user.is_staff:
			return queryset
		return queryset.filter(emergency_report__reporter=user)


def _default_full_name(user):
	name = f"{user.first_name} {user.last_name}".strip()
	return name or user.username


def get_or_create_citizen_profile(user):
	profile, _created = CitizenProfile.objects.get_or_create(
		user=user,
		defaults={"full_name": _default_full_name(user)},
	)
	return profile


class CitizenProfileView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def get(self, request):
		profile = get_or_create_citizen_profile(request.user)
		serializer = CitizenProfileSerializer(profile, context={"request": request})
		return Response(serializer.data)

	def put(self, request):
		profile = get_or_create_citizen_profile(request.user)
		serializer = CitizenProfileSerializer(
			profile,
			data=request.data,
			partial=True,
			context={"request": request},
		)
		serializer.is_valid(raise_exception=True)
		serializer.save()
		return Response(serializer.data)


class ChangePasswordView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def post(self, request):
		serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
		serializer.is_valid(raise_exception=True)

		user = request.user
		user.set_password(serializer.validated_data["new_password"])
		user.save(update_fields=["password"])

		return Response({"detail": "Password changed successfully."})


class CitizenRegisterView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [RegistrationRateThrottle]

    def post(self, request):
        from .services.abuse_detection import process_registration_abuse

        serializer = CitizenRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Retrieve the validated OTP record before save() pops it
        otp_record = serializer.validated_data.get("_otp_record")

        with transaction.atomic():
            user = serializer.save()
            # Mark the REGISTER OTP as used now that the account exists
            if otp_record:
                otp_record.is_used = True
                otp_record.save(update_fields=["is_used"])

        profile = get_or_create_citizen_profile(user)
        try:
            process_registration_abuse(profile, client_ip=get_client_ip(request))
        except Exception:
            pass

        return Response(
            {"detail": "Account created successfully. Please sign in."},
            status=status.HTTP_201_CREATED,
        )


# =============================================================================
# OTP helpers
# =============================================================================

def _send_otp_email(to_email: str, otp_code: str, purpose: str) -> None:
    """
    Send a RescueLink OTP email via Gmail SMTP.
    In DEBUG mode, also print the OTP to the console for local development.
    Never log or expose OTP in production.
    """
    if settings.DEBUG:
        # Safe to print during local development; never runs in production
        security_logger.debug("[DEBUG] OTP for %s (%s): %s", to_email, purpose, otp_code)

    if purpose == OTPRecord.PURPOSE_REGISTER:
        subject = "RescueLink — Email Verification OTP"
        action_label = "Complete your registration"
        purpose_label = "to verify your email and complete your citizen account registration"
    else:
        subject = "RescueLink — Password Reset OTP"
        action_label = "Reset your password"
        purpose_label = "to reset your RescueLink account password"

    plain_message = (
        f"Your RescueLink One-Time Password (OTP)\n\n"
        f"Use the following 6-digit code {purpose_label}:\n\n"
        f"  {otp_code}\n\n"
        f"This code expires in {getattr(settings, 'OTP_EXPIRY_MINUTES', 5)} minutes.\n\n"
        f"If you did not request this, please ignore this email.\n\n"
        f"— The RescueLink Team"
    )

    html_message = f"""\
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="500" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,.10);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a5f 0%,#0f172a 100%);padding:28px 32px;text-align:center;">
              <div style="display:inline-flex;align-items:center;gap:10px;">
                <span style="font-size:28px;">&#x1F6E1;&#xFE0F;</span>
                <span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">RescueLink</span>
              </div>
              <p style="color:#94a3b8;font-size:12px;margin:8px 0 0 0;letter-spacing:0.5px;">
                CITIZEN EMERGENCY RESPONSE NETWORK
              </p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 32px;">
              <h1 style="color:#0f172a;font-size:20px;font-weight:800;margin:0 0 8px 0;">
                {action_label}
              </h1>
              <p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 28px 0;">
                Use the code below {purpose_label}.
                This code expires in <strong>{getattr(settings, 'OTP_EXPIRY_MINUTES', 5)} minutes</strong>.
              </p>
              <!-- OTP Box -->
              <div style="background:#f8fafc;border:2px solid #e2e8f0;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
                <p style="color:#64748b;font-size:12px;font-weight:700;letter-spacing:1px;margin:0 0 10px 0;">YOUR ONE-TIME PASSWORD</p>
                <p style="color:#0f172a;font-size:42px;font-weight:900;letter-spacing:12px;margin:0;font-variant-numeric:tabular-nums;">
                  {otp_code}
                </p>
              </div>
              <p style="color:#94a3b8;font-size:12px;line-height:1.6;margin:0;">
                If you did not request this, you can safely ignore this email.
                Do not share this code with anyone.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 32px;text-align:center;">
              <p style="color:#94a3b8;font-size:11px;margin:0;">
                &copy; RescueLink — Citizen Emergency Response Network
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    send_mail(
        subject=subject,
        message=plain_message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[to_email],
        html_message=html_message,
        fail_silently=False,
    )


def _create_otp_record(email: str, purpose: str) -> str:
    """
    Delete any previous unused OTP records for this email+purpose, then
    create a fresh OTPRecord.  Returns the plain 6-digit OTP code (to send
    by email).  The code itself is NOT stored — only its SHA-256 hash.
    """
    # Clean up old/unused records for this email+purpose
    OTPRecord.objects.filter(
        email__iexact=email,
        purpose=purpose,
        is_used=False,
    ).delete()

    otp_code = generate_otp_code()
    OTPRecord.objects.create(
        email=email.lower(),
        otp_hash=hash_otp(otp_code),
        purpose=purpose,
    )
    return otp_code


# =============================================================================
# Registration OTP views
# =============================================================================

class RequestRegisterOTPView(APIView):
    """
    POST /api/auth/request-register-otp/
    Body: {"email": "user@example.com"}

    Sends a 6-digit OTP to the given Gmail for registration.
    Returns an error if the email is already registered.
    """
    permission_classes = [permissions.AllowAny]
    throttle_classes = [OTPRequestRateThrottle]

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        if not email:
            return Response({"detail": "Email is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Basic format check (EmailField does full validation; this is a quick guard)
        if "@" not in email or "." not in email.split("@")[-1]:
            return Response({"detail": "Enter a valid email address."}, status=status.HTTP_400_BAD_REQUEST)

        # Block if a user with this email already exists
        if UserModel.objects.filter(email__iexact=email).exists():
            return Response(
                {"detail": "An account with this email already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            otp_code = _create_otp_record(email, OTPRecord.PURPOSE_REGISTER)
            _send_otp_email(email, otp_code, OTPRecord.PURPOSE_REGISTER)
        except Exception as exc:
            security_logger.error("OTP send error for %s: %s", email, exc)
            return Response(
                {"detail": "Failed to send OTP email. Please try again later."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({"detail": "OTP sent to your email. Please check your inbox."})


class VerifyRegisterOTPView(APIView):
    """
    POST /api/auth/verify-register-otp/
    Body: {"email": "user@example.com", "otp": "123456"}

    Verifies the OTP and sets verified_at.  Does NOT mark is_used=True yet
    — that happens at /register/ after the account is created.
    """
    permission_classes = [permissions.AllowAny]
    throttle_classes = [OTPVerifyRateThrottle]

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        otp_code = (request.data.get("otp") or "").strip()

        if not email or not otp_code:
            return Response(
                {"detail": "Email and OTP are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        otp_record = (
            OTPRecord.objects
            .filter(
                email__iexact=email,
                purpose=OTPRecord.PURPOSE_REGISTER,
                is_used=False,
            )
            .order_by("-created_at")
            .first()
        )

        if otp_record is None:
            return Response(
                {"detail": "No active OTP found for this email. Please request a new OTP."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if otp_record.is_blocked():
            return Response(
                {"detail": "Too many failed attempts. Please request a new OTP."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if otp_record.is_expired():
            return Response(
                {"detail": "OTP has expired. Please request a new one."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not otp_record.check_otp(otp_code):
            otp_record.attempt_count += 1
            otp_record.save(update_fields=["attempt_count"])
            remaining = max(0, getattr(settings, "OTP_MAX_ATTEMPTS", 5) - otp_record.attempt_count)
            if remaining == 0:
                return Response(
                    {"detail": "Too many failed attempts. Please request a new OTP."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(
                {"detail": f"Incorrect OTP. {remaining} attempt(s) remaining."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Mark as verified (not used — that happens at /register/)
        otp_record.verified_at = timezone.now()
        otp_record.save(update_fields=["verified_at"])

        return Response({"detail": "OTP verified successfully. You may now complete your registration."})


# =============================================================================
# Forgot Password OTP views
# =============================================================================

class RequestPasswordResetOTPView(APIView):
    """
    POST /api/auth/request-password-reset-otp/
    Body: {"email": "user@example.com"}

    Sends a FORGOT_PASSWORD OTP.  Always returns 200 to avoid revealing
    whether the email is registered (security: no user enumeration).
    """
    permission_classes = [permissions.AllowAny]
    throttle_classes = [OTPRequestRateThrottle]

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        if not email:
            return Response({"detail": "Email is required."}, status=status.HTTP_400_BAD_REQUEST)

        if "@" not in email or "." not in email.split("@")[-1]:
            return Response({"detail": "Enter a valid email address."}, status=status.HTTP_400_BAD_REQUEST)

        # If email is not registered, return 200 silently (no user enumeration)
        user_exists = UserModel.objects.filter(email__iexact=email).exists()
        if not user_exists:
            security_logger.info("Password reset OTP requested for unknown email: %s", email)
            return Response({
                "detail": "If that email is registered, an OTP has been sent."
            })

        try:
            otp_code = _create_otp_record(email, OTPRecord.PURPOSE_FORGOT)
            _send_otp_email(email, otp_code, OTPRecord.PURPOSE_FORGOT)
        except Exception as exc:
            security_logger.error("OTP send error for password reset %s: %s", email, exc)
            return Response(
                {"detail": "Failed to send OTP email. Please try again later."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({"detail": "If that email is registered, an OTP has been sent."})


class ResetPasswordWithOTPView(APIView):
    """
    POST /api/auth/reset-password-with-otp/
    Body: {"email": "user@example.com", "otp": "123456", "new_password": "newpass123"}

    Verifies the FORGOT_PASSWORD OTP and resets the user's password.
    Marks OTP as is_used=True after successful reset.
    Does NOT return JWT tokens — user must log in manually.
    """
    permission_classes = [permissions.AllowAny]
    throttle_classes = [OTPVerifyRateThrottle]

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        otp_code = (request.data.get("otp") or "").strip()
        new_password = (request.data.get("new_password") or "").strip()

        if not email or not otp_code or not new_password:
            return Response(
                {"detail": "Email, OTP, and new password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(new_password) < 8:
            return Response(
                {"detail": "New password must be at least 8 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        otp_record = (
            OTPRecord.objects
            .filter(
                email__iexact=email,
                purpose=OTPRecord.PURPOSE_FORGOT,
                is_used=False,
            )
            .order_by("-created_at")
            .first()
        )

        if otp_record is None:
            return Response(
                {"detail": "No active OTP found for this email. Please request a new OTP."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if otp_record.is_blocked():
            return Response(
                {"detail": "Too many failed attempts. Please request a new OTP."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if otp_record.is_expired():
            return Response(
                {"detail": "OTP has expired. Please request a new one."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not otp_record.check_otp(otp_code):
            otp_record.attempt_count += 1
            otp_record.save(update_fields=["attempt_count"])
            remaining = max(0, getattr(settings, "OTP_MAX_ATTEMPTS", 5) - otp_record.attempt_count)
            if remaining == 0:
                return Response(
                    {"detail": "Too many failed attempts. Please request a new OTP."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(
                {"detail": f"Incorrect OTP. {remaining} attempt(s) remaining."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # OTP is valid — look up the user and reset password
        try:
            user = UserModel.objects.get(email__iexact=email)
        except UserModel.DoesNotExist:
            # Should never happen (we checked user existence at request time),
            # but handle gracefully
            return Response(
                {"detail": "No account found with this email."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            user.set_password(new_password)
            user.save(update_fields=["password"])
            # Mark OTP as used immediately after successful password reset
            otp_record.is_used = True
            otp_record.save(update_fields=["is_used"])

        security_logger.info("Password reset via OTP for user %s (email=%s)", user.username, email)

        return Response({"detail": "Password reset successfully. Please sign in with your new password."})
