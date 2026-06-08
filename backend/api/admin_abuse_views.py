import logging
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import CitizenProfile, EmergencyReport
from .permissions import IsAdminRole, IsStaffUser
from .query_utils import parse_bool_param, sanitize_search_term
from .serializers import CitizenAdminSerializer, EmergencyReportSerializer
from .throttling import AdminActionRateThrottle

User = get_user_model()
logger = logging.getLogger(__name__)


class CitizenAdminViewSet(viewsets.ReadOnlyModelViewSet):
	"""Staff/admin tools for flagged or suspended citizen accounts."""

	permission_classes = [IsStaffUser]
	serializer_class = CitizenAdminSerializer
	lookup_field = "pk"
	throttle_classes = [AdminActionRateThrottle]

	def get_queryset(self):
		queryset = (
			CitizenProfile.objects.select_related("user")
			.filter(user__groups__name="CITIZEN")
			.distinct()
			.order_by("-updated_at")
		)

		flagged = parse_bool_param(self.request.query_params.get("is_flagged"))
		if flagged is not None:
			queryset = queryset.filter(is_flagged=flagged)

		suspended = parse_bool_param(self.request.query_params.get("is_suspended"))
		if suspended is not None:
			queryset = queryset.filter(is_suspended=suspended)

		search = sanitize_search_term(self.request.query_params.get("search", ""))
		if search:
			queryset = queryset.filter(
				user__username__icontains=search
			) | queryset.filter(full_name__icontains=search) | queryset.filter(
				contact_number__icontains=search
			)

		return queryset

	@action(detail=True, methods=["post"], url_path="suspend", permission_classes=[IsAdminRole])
	def suspend(self, request, pk=None):
		profile = self.get_object()
		reason = str(request.data.get("reason", "Suspended by admin for review."))[:2000]
		hours = request.data.get("hours", 24)
		try:
			hours = max(1, min(int(hours), 168))
		except (TypeError, ValueError):
			hours = 24

		profile.is_suspended = True
		profile.suspension_reason = reason
		profile.suspension_until = timezone.now() + timedelta(hours=hours)
		profile.save(
			update_fields=["is_suspended", "suspension_reason", "suspension_until", "updated_at"]
		)
		logger.warning(
			"Admin temporary suspension user=%s by=%s hours=%s",
			profile.user_id,
			request.user.username,
			hours,
		)
		return Response(CitizenAdminSerializer(profile).data)

	@action(detail=True, methods=["post"], url_path="unsuspend", permission_classes=[IsAdminRole])
	def unsuspend(self, request, pk=None):
		profile = self.get_object()
		profile.is_suspended = False
		profile.suspension_reason = ""
		profile.suspension_until = None
		profile.last_risk_review_at = timezone.now()
		profile.save(
			update_fields=[
				"is_suspended",
				"suspension_reason",
				"suspension_until",
				"last_risk_review_at",
				"updated_at",
			]
		)
		logger.info(
			"Admin unsuspended user=%s by=%s",
			profile.user_id,
			request.user.username,
		)
		return Response(CitizenAdminSerializer(profile).data)

	@action(detail=True, methods=["post"], url_path="mark-reviewed", permission_classes=[IsAdminRole])
	def mark_reviewed(self, request, pk=None):
		profile = self.get_object()
		profile.is_flagged = False
		profile.last_risk_review_at = timezone.now()
		if request.data.get("verify"):
			profile.is_verified = True
		profile.save(
			update_fields=["is_flagged", "last_risk_review_at", "is_verified", "updated_at"]
		)
		logger.info(
			"Admin marked citizen reviewed user=%s by=%s verify=%s",
			profile.user_id,
			request.user.username,
			request.data.get("verify"),
		)
		return Response(CitizenAdminSerializer(profile).data)


class FlaggedReportAdminViewSet(viewsets.ReadOnlyModelViewSet):
	permission_classes = [IsStaffUser]
	serializer_class = EmergencyReportSerializer
	throttle_classes = [AdminActionRateThrottle]

	def get_queryset(self):
		queryset = EmergencyReport.objects.select_related("reporter", "reviewed_by").filter(
			is_flagged=True
		)
		needs_verification = parse_bool_param(self.request.query_params.get("needs_verification"))
		if needs_verification is not None:
			queryset = queryset.filter(needs_verification=needs_verification)
		flag_type = (self.request.query_params.get("flag_type") or "").strip().upper()
		if flag_type:
			queryset = queryset.filter(flag_type=flag_type)
		return queryset.order_by("-created_at")

	@action(detail=True, methods=["post"], url_path="mark-reviewed", permission_classes=[IsAdminRole])
	def mark_reviewed(self, request, pk=None):
		report = self.get_object()
		report.is_flagged = False
		report.needs_verification = False
		report.reviewed_at = timezone.now()
		report.reviewed_by = request.user
		report.save(
			update_fields=[
				"is_flagged",
				"needs_verification",
				"reviewed_at",
				"reviewed_by",
				"updated_at",
			]
		)
		logger.info(
			"Admin marked report reviewed report=%s by=%s",
			report.pk,
			request.user.username,
		)
		return Response(
			EmergencyReportSerializer(report, context={"request": request}).data
		)
