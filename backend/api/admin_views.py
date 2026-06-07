from django.contrib.auth import get_user_model
from rest_framework import status, viewsets
from rest_framework.response import Response

from .models import EmergencyCategory
from .permissions import IsAdminRole, STAFF_ROLES
from .serializers import (
	EmergencyCategorySerializer,
	StaffUserCreateSerializer,
	StaffUserSerializer,
	StaffUserUpdateSerializer,
)

User = get_user_model()


class StaffUserViewSet(viewsets.ModelViewSet):
	permission_classes = [IsAdminRole]
	lookup_field = "pk"

	def get_queryset(self):
		queryset = (
			User.objects.filter(groups__name__in=STAFF_ROLES)
			.distinct()
			.order_by("-date_joined")
		)

		role = self.request.query_params.get("role")
		if role and role in STAFF_ROLES:
			queryset = queryset.filter(groups__name=role)

		search = self.request.query_params.get("search", "").strip()
		if search:
			queryset = queryset.filter(username__icontains=search) | queryset.filter(
				email__icontains=search
			) | queryset.filter(first_name__icontains=search) | queryset.filter(
				last_name__icontains=search
			)

		active = self.request.query_params.get("is_active")
		if active in ("true", "false"):
			queryset = queryset.filter(is_active=(active == "true"))

		return queryset

	def get_serializer_class(self):
		if self.action == "create":
			return StaffUserCreateSerializer
		if self.action in ("update", "partial_update"):
			return StaffUserUpdateSerializer
		return StaffUserSerializer

	def create(self, request, *args, **kwargs):
		serializer = StaffUserCreateSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		user = serializer.save()
		output = StaffUserSerializer(user)
		return Response(output.data, status=status.HTTP_201_CREATED)

	def update(self, request, *args, **kwargs):
		partial = kwargs.pop("partial", False)
		user = self.get_object()
		serializer = StaffUserUpdateSerializer(user, data=request.data, partial=partial)
		serializer.is_valid(raise_exception=True)
		user = serializer.save()
		output = StaffUserSerializer(user)
		return Response(output.data)

	def partial_update(self, request, *args, **kwargs):
		kwargs["partial"] = True
		return self.update(request, *args, **kwargs)

	def destroy(self, request, *args, **kwargs):
		user = self.get_object()
		if user.pk == request.user.pk:
			return Response(
				{"detail": "You cannot deactivate your own admin account."},
				status=status.HTTP_400_BAD_REQUEST,
			)
		user.is_active = False
		user.save(update_fields=["is_active"])
		return Response(status=status.HTTP_204_NO_CONTENT)


class EmergencyCategoryViewSet(viewsets.ModelViewSet):
	permission_classes = [IsAdminRole]
	queryset = EmergencyCategory.objects.all().order_by("name")
	serializer_class = EmergencyCategorySerializer

	def get_queryset(self):
		queryset = super().get_queryset()
		active = self.request.query_params.get("is_active")
		if active in ("true", "false"):
			queryset = queryset.filter(is_active=(active == "true"))
		return queryset

	def destroy(self, request, *args, **kwargs):
		category = self.get_object()
		category.is_active = False
		category.save(update_fields=["is_active", "updated_at"])
		return Response(status=status.HTTP_204_NO_CONTENT)
