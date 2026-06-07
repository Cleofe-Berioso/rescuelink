from django.db import transaction
from django.http import HttpResponse
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import CitizenProfile, EmergencyReport, IncidentResponse, IncidentStatusHistory
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
from .report_status import (
	can_accept_respond,
	status_after_unit_accept,
	validate_status_transition,
)
from .throttling import (
	RegistrationRateThrottle,
	ReportCreateRateThrottle,
	StaffActionRateThrottle,
)


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def health(request):
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
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		image_file = serializer.validated_data.pop("image", None)

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
				object_key = upload_emergency_photo(
					report.id,
					image_file,
					image_file.content_type,
					image_file.name,
				)
				report.image = object_key
				report.save(update_fields=["image", "updated_at"])
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
		serializer = CitizenRegisterSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		serializer.save()
		return Response(
			{"detail": "Account created successfully. Please sign in."},
			status=status.HTTP_201_CREATED,
		)
