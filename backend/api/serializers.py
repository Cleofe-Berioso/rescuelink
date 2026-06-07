import logging

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.conf import settings
from django.contrib.auth.models import User
from django.urls import reverse
from PIL import Image
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import CitizenProfile, EmergencyCategory, EmergencyReport, IncidentResponse, IncidentStatusHistory
from .storage import ALLOWED_EMERGENCY_PHOTO_CONTENT_TYPES

UserModel = get_user_model()
security_logger = logging.getLogger("rescuelink.security")

ROLE_PRIORITY = ("ADMIN", "DRRM", "BFP", "POLICE", "CITIZEN")
STAFF_ROLES = ("ADMIN", "DRRM", "BFP", "POLICE")
SUGGESTED_UNIT_VALUES = ("DRRM", "BFP", "POLICE")


def get_user_role(user):
    group_names = set(user.groups.values_list("name", flat=True))
    for role in ROLE_PRIORITY:
        if role in group_names:
            return role
    return "CITIZEN"


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "email"]


class RescueLinkTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        request = self.context.get("request")
        username = attrs.get(self.username_field, "")
        try:
            data = super().validate(attrs)
        except AuthenticationFailed:
            client_ip = ""
            if request is not None:
                client_ip = request.META.get("REMOTE_ADDR", "")
            security_logger.warning(
                "Failed login attempt username=%s ip=%s",
                username,
                client_ip,
            )
            raise AuthenticationFailed(
                "Invalid username or password.",
                code="authorization",
            ) from None
        user = self.user
        data["user"] = {
            "id": user.id,
            "username": user.username,
            "email": user.email or "",
            "role": get_user_role(user),
            "is_staff": user.is_staff,
            "is_superuser": user.is_superuser,
        }
        return data


class CitizenIncidentResponseSerializer(serializers.ModelSerializer):
    """Public unit response details for citizens — no staff account data."""

    unit = serializers.CharField(source="response_unit", read_only=True)
    status = serializers.CharField(source="response_status", read_only=True)
    notes = serializers.CharField(source="response_notes", read_only=True)

    class Meta:
        model = IncidentResponse
        fields = ["id", "unit", "status", "notes", "accepted_at"]
        read_only_fields = fields


class EmergencyReportSerializer(serializers.ModelSerializer):
    reporter = UserSerializer(read_only=True)
    image_url = serializers.SerializerMethodField()
    image = serializers.ImageField(write_only=True, required=False, allow_null=True)
    responses = CitizenIncidentResponseSerializer(many=True, read_only=True)

    class Meta:
        model = EmergencyReport
        fields = [
            "id",
            "reporter",
            "emergency_description",
            "image",
            "image_url",
            "latitude",
            "longitude",
            "contact_number",
            "address_text",
            "status",
            "created_at",
            "updated_at",
            "responses",
        ]
        read_only_fields = ["status", "created_at", "updated_at", "reporter"]

    def validate_emergency_description(self, value):
        text = (value or "").strip()
        if not text:
            raise serializers.ValidationError("Emergency description is required.")
        if len(text) > 5000:
            raise serializers.ValidationError("Description must be 5000 characters or fewer.")
        return text

    def validate_contact_number(self, value):
        text = (value or "").strip()
        if not text:
            raise serializers.ValidationError("Contact number is required.")
        if len(text) > 30:
            raise serializers.ValidationError("Contact number is too long.")
        return text

    def validate_address_text(self, value):
        if value is None:
            return ""
        text = str(value).strip()
        if len(text) > 255:
            raise serializers.ValidationError("Address must be 255 characters or fewer.")
        return text

    def update(self, instance, validated_data):
        validated_data.pop("image", None)
        return super().update(instance, validated_data)

    def validate_image(self, value):
        if value is None:
            return None

        if value.size > settings.MAX_EMERGENCY_PHOTO_BYTES:
            max_mb = settings.MAX_EMERGENCY_PHOTO_BYTES / (1024 * 1024)
            raise serializers.ValidationError(
                f"Image must be {max_mb:.0f} MB or smaller."
            )

        content_type = (value.content_type or "").lower()
        if content_type not in ALLOWED_EMERGENCY_PHOTO_CONTENT_TYPES:
            raise serializers.ValidationError(
                "Only JPEG, PNG, and WebP images are allowed."
            )

        value.seek(0)
        try:
            with Image.open(value) as img:
                img.verify()
        except Exception as exc:
            raise serializers.ValidationError("Invalid or corrupted image file.") from exc
        finally:
            value.seek(0)

        return value

    def get_image_url(self, obj):
        if not obj.image:
            return None
        request = self.context.get("request")
        path = reverse("reports-image", kwargs={"pk": obj.pk})
        if request is None:
            return path
        return request.build_absolute_uri(path)


class IncidentResponseSerializer(serializers.ModelSerializer):
    responder_user = UserSerializer(read_only=True)

    class Meta:
        model = IncidentResponse
        fields = [
            "id",
            "emergency_report",
            "responder_user",
            "response_unit",
            "response_status",
            "response_notes",
            "accepted_at",
        ]
        read_only_fields = ["accepted_at"]


class CitizenProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = CitizenProfile
        fields = [
            "id",
            "username",
            "email",
            "full_name",
            "contact_number",
            "home_address",
            "emergency_contact_name",
            "emergency_contact_number",
            "emergency_contact_relationship",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "username", "email", "created_at", "updated_at"]

    def update(self, instance, validated_data):
        profile = super().update(instance, validated_data)

        full_name = validated_data.get("full_name")
        if full_name is not None:
            parts = full_name.strip().split(None, 1)
            user = instance.user
            user.first_name = parts[0] if parts else ""
            user.last_name = parts[1] if len(parts) > 1 else ""
            user.save(update_fields=["first_name", "last_name"])

        return profile


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, min_length=8)
    confirm_password = serializers.CharField(required=True)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError(
                {"confirm_password": "New password and confirmation do not match."}
            )

        user = self.context["request"].user
        if not user.check_password(attrs["current_password"]):
            raise serializers.ValidationError(
                {"current_password": "Current password is incorrect."}
            )

        return attrs


class CitizenRegisterSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150)
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    contact_number = serializers.CharField(max_length=30)
    password = serializers.CharField(min_length=8, write_only=True)
    confirm_password = serializers.CharField(write_only=True)

    def validate_username(self, value):
        username = value.strip()
        if not username:
            raise serializers.ValidationError("Username is required.")
        if UserModel.objects.filter(username__iexact=username).exists():
            raise serializers.ValidationError("Username is already taken.")
        return username

    def validate_full_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Full name is required.")
        return value.strip()

    def validate_contact_number(self, value):
        if not value.strip():
            raise serializers.ValidationError("Contact number is required.")
        return value.strip()

    def validate(self, attrs):
        if attrs["password"] != attrs["confirm_password"]:
            raise serializers.ValidationError(
                {"confirm_password": "Password and confirmation do not match."}
            )
        return attrs

    def create(self, validated_data):
        validated_data.pop("confirm_password")
        full_name = validated_data.pop("full_name")
        contact_number = validated_data.pop("contact_number")
        password = validated_data.pop("password")

        name_parts = full_name.split(None, 1)
        first_name = name_parts[0] if name_parts else ""
        last_name = name_parts[1] if len(name_parts) > 1 else ""

        user = UserModel.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"].strip(),
            password=password,
            first_name=first_name,
            last_name=last_name,
        )

        citizen_group, _ = Group.objects.get_or_create(name="CITIZEN")
        user.groups.add(citizen_group)

        CitizenProfile.objects.create(
            user=user,
            full_name=full_name,
            contact_number=contact_number,
        )

        return user


class IncidentStatusHistorySerializer(serializers.ModelSerializer):
    updated_by = UserSerializer(read_only=True)

    class Meta:
        model = IncidentStatusHistory
        fields = ["id", "emergency_report", "status", "updated_by", "remarks", "created_at"]
        read_only_fields = ["created_at"]


class StaffUserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    date_joined = serializers.DateTimeField(read_only=True)

    class Meta:
        model = UserModel
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "role",
            "is_active",
            "is_staff",
            "date_joined",
        ]
        read_only_fields = ["id", "date_joined", "is_staff"]

    def get_role(self, obj):
        return get_user_role(obj)


class StaffUserCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField(required=False, allow_blank=True)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    password = serializers.CharField(min_length=8, write_only=True)
    role = serializers.ChoiceField(choices=STAFF_ROLES)
    is_active = serializers.BooleanField(default=True)

    def validate_username(self, value):
        username = value.strip()
        if not username:
            raise serializers.ValidationError("Username is required.")
        if UserModel.objects.filter(username__iexact=username).exists():
            raise serializers.ValidationError("Username is already taken.")
        return username

    def validate_role(self, value):
        if value not in STAFF_ROLES:
            raise serializers.ValidationError("Invalid staff role.")
        return value

    def create(self, validated_data):
        role = validated_data.pop("role")
        password = validated_data.pop("password")
        user = UserModel.objects.create_user(
            username=validated_data["username"],
            email=validated_data.get("email", ""),
            password=password,
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
            is_active=validated_data.get("is_active", True),
            is_staff=True,
        )
        group = Group.objects.get(name=role)
        user.groups.set([group])
        return user


class StaffUserUpdateSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False, allow_blank=True)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    password = serializers.CharField(min_length=8, required=False, write_only=True)
    role = serializers.ChoiceField(choices=STAFF_ROLES, required=False)
    is_active = serializers.BooleanField(required=False)

    def validate_role(self, value):
        if value not in STAFF_ROLES:
            raise serializers.ValidationError("Invalid staff role.")
        return value

    def update(self, instance, validated_data):
        role = validated_data.pop("role", None)
        password = validated_data.pop("password", None)

        for field in ("email", "first_name", "last_name", "is_active"):
            if field in validated_data:
                setattr(instance, field, validated_data[field])

        if role:
            group = Group.objects.get(name=role)
            instance.groups.set([group])
            instance.is_staff = True

        if password:
            instance.set_password(password)

        instance.save()
        return instance


class EmergencyCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = EmergencyCategory
        fields = [
            "id",
            "name",
            "description",
            "suggested_units",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_suggested_units(self, value):
        if value is None:
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError("Suggested units must be a list.")
        cleaned = []
        for unit in value:
            unit_upper = str(unit).strip().upper()
            if unit_upper not in SUGGESTED_UNIT_VALUES:
                raise serializers.ValidationError(
                    f"Invalid suggested unit: {unit}. Allowed: DRRM, BFP, POLICE."
                )
            if unit_upper not in cleaned:
                cleaned.append(unit_upper)
        return cleaned

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Name is required.")
        return name
