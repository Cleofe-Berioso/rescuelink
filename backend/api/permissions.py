from rest_framework import permissions

from .serializers import get_user_role

STAFF_ROLES = ("ADMIN", "DRRM", "BFP", "POLICE")


class IsAdminRole(permissions.BasePermission):
	message = "Admin access required."

	def has_permission(self, request, view):
		if not request.user or not request.user.is_authenticated:
			return False
		return get_user_role(request.user) == "ADMIN"


class IsStaffUser(permissions.BasePermission):
	message = "Staff access required."

	def has_permission(self, request, view):
		if not request.user or not request.user.is_authenticated:
			return False
		return request.user.is_staff
