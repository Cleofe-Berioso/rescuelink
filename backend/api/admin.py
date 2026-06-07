from django.contrib import admin

from .models import CitizenProfile, EmergencyCategory, EmergencyReport, IncidentResponse, IncidentStatusHistory, Notification


@admin.register(EmergencyReport)
class EmergencyReportAdmin(admin.ModelAdmin):
	list_display = ("id", "reporter", "status", "created_at")
	search_fields = ("reporter__username", "emergency_description", "contact_number")
	list_filter = ("status", "created_at")


@admin.register(IncidentResponse)
class IncidentResponseAdmin(admin.ModelAdmin):
	list_display = ("id", "emergency_report", "response_unit", "response_status", "accepted_at")
	list_filter = ("response_unit", "response_status", "accepted_at")


@admin.register(IncidentStatusHistory)
class IncidentStatusHistoryAdmin(admin.ModelAdmin):
	list_display = ("id", "emergency_report", "status", "updated_by", "created_at")
	list_filter = ("status", "created_at")


@admin.register(CitizenProfile)
class CitizenProfileAdmin(admin.ModelAdmin):
	list_display = ("id", "user", "full_name", "contact_number", "updated_at")
	search_fields = ("user__username", "full_name", "contact_number")


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
	list_display = ("id", "user", "title", "is_read", "created_at")
	list_filter = ("is_read", "created_at")


@admin.register(EmergencyCategory)
class EmergencyCategoryAdmin(admin.ModelAdmin):
	list_display = ("name", "is_active", "created_at")
	list_filter = ("is_active",)
