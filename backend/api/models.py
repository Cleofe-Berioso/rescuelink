from django.contrib.auth.models import User
from django.db import models


class EmergencyReport(models.Model):
	LEVEL_LOW = "LOW"
	LEVEL_MEDIUM = "MEDIUM"
	LEVEL_HIGH = "HIGH"
	LEVEL_CRITICAL = "CRITICAL"

	LEVEL_CHOICES = [
		(LEVEL_LOW, "Low"),
		(LEVEL_MEDIUM, "Medium"),
		(LEVEL_HIGH, "High"),
		(LEVEL_CRITICAL, "Critical"),
	]

	RISK_LOW = "LOW"
	RISK_MEDIUM = "MEDIUM"
	RISK_HIGH = "HIGH"
	RISK_EXTREME = "EXTREME"

	RISK_LEVEL_CHOICES = [
		(RISK_LOW, "Low"),
		(RISK_MEDIUM, "Medium"),
		(RISK_HIGH, "High"),
		(RISK_EXTREME, "Extreme"),
	]

	FLAG_SPAM = "SPAM"
	FLAG_DUPLICATE_REPORT = "DUPLICATE_REPORT"
	FLAG_REVIEW = "REVIEW"

	FLAG_TYPE_CHOICES = [
		(FLAG_SPAM, "Possible Spam"),
		(FLAG_DUPLICATE_REPORT, "Suspicious Duplicate"),
		(FLAG_REVIEW, "Needs Review"),
	]

	AI_STATUS_NOT_ANALYZED = "not_analyzed"
	AI_STATUS_ANALYZED = "analyzed"
	AI_STATUS_FAILED = "failed"
	AI_STATUS_FALLBACK = "fallback"

	AI_STATUS_CHOICES = [
		(AI_STATUS_NOT_ANALYZED, "Not analyzed"),
		(AI_STATUS_ANALYZED, "Analyzed"),
		(AI_STATUS_FAILED, "Failed"),
		(AI_STATUS_FALLBACK, "Fallback"),
	]

	STATUS_PENDING = "PENDING"
	STATUS_VIEWED = "VIEWED"
	STATUS_ACCEPTED = "ACCEPTED"
	STATUS_DISPATCHED = "DISPATCHED"
	STATUS_IN_PROGRESS = "IN_PROGRESS"
	STATUS_RESOLVED = "RESOLVED"
	STATUS_CANCELLED = "CANCELLED"

	STATUS_CHOICES = [
		(STATUS_PENDING, "Pending"),
		(STATUS_VIEWED, "Viewed"),
		(STATUS_ACCEPTED, "Accepted"),
		(STATUS_DISPATCHED, "Dispatched"),
		(STATUS_IN_PROGRESS, "In Progress"),
		(STATUS_RESOLVED, "Resolved"),
		(STATUS_CANCELLED, "Cancelled"),
	]

	reporter = models.ForeignKey(User, on_delete=models.CASCADE, related_name="reports")
	emergency_description = models.TextField()
	image = models.CharField(max_length=512, blank=True, default="")
	latitude = models.DecimalField(max_digits=10, decimal_places=7)
	longitude = models.DecimalField(max_digits=10, decimal_places=7)
	contact_number = models.CharField(max_length=30)
	address_text = models.CharField(max_length=255, blank=True)
	status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
	is_priority = models.BooleanField(default=False)
	priority_level = models.CharField(
		max_length=10, choices=LEVEL_CHOICES, default=LEVEL_LOW
	)
	critical_level = models.CharField(
		max_length=10, choices=LEVEL_CHOICES, default=LEVEL_LOW
	)
	ai_priority_reason = models.TextField(blank=True, default="")
	detected_incident_type = models.CharField(max_length=120, blank=True, default="")
	suggested_units = models.JSONField(default=list, blank=True)
	ai_confidence = models.IntegerField(null=True, blank=True)
	ai_analyzed_at = models.DateTimeField(null=True, blank=True)
	ai_analysis_status = models.CharField(
		max_length=20,
		choices=AI_STATUS_CHOICES,
		default=AI_STATUS_NOT_ANALYZED,
	)
	priority_score = models.IntegerField(null=True, blank=True)
	risk_score = models.IntegerField(null=True, blank=True)
	risk_level = models.CharField(
		max_length=10,
		choices=RISK_LEVEL_CHOICES,
		default=RISK_LOW,
	)
	is_flagged = models.BooleanField(default=False)
	flag_reason = models.TextField(blank=True, default="")
	flag_type = models.CharField(
		max_length=30,
		choices=FLAG_TYPE_CHOICES,
		blank=True,
		default="",
	)
	needs_verification = models.BooleanField(default=False)
	ai_review_result = models.JSONField(default=dict, blank=True)
	image_content_hash = models.CharField(max_length=64, blank=True, default="")
	reviewed_at = models.DateTimeField(null=True, blank=True)
	reviewed_by = models.ForeignKey(
		User,
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="reviewed_reports",
	)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["-created_at"]

	def __str__(self):
		return f"Report #{self.pk} - {self.status}"


class IncidentResponse(models.Model):
	UNIT_DRRM = "DRRM"
	UNIT_BFP = "BFP"
	UNIT_POLICE = "POLICE"

	UNIT_CHOICES = [
		(UNIT_DRRM, "DRRM"),
		(UNIT_BFP, "BFP"),
		(UNIT_POLICE, "POLICE"),
	]

	emergency_report = models.ForeignKey(EmergencyReport, on_delete=models.CASCADE, related_name="responses")
	responder_user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
	response_unit = models.CharField(max_length=20, choices=UNIT_CHOICES)
	response_status = models.CharField(max_length=20, default="ACCEPTED")
	response_notes = models.TextField(blank=True)
	accepted_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["-accepted_at"]
		constraints = [
			models.UniqueConstraint(
				fields=["emergency_report", "response_unit"],
				name="unique_report_unit_response",
			)
		]

	def __str__(self):
		return f"Response #{self.pk} - {self.response_unit}"


class IncidentStatusHistory(models.Model):
	emergency_report = models.ForeignKey(EmergencyReport, on_delete=models.CASCADE, related_name="status_history")
	status = models.CharField(max_length=20, choices=EmergencyReport.STATUS_CHOICES)
	updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
	remarks = models.TextField(blank=True)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["-created_at"]


class Notification(models.Model):
	user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
	emergency_report = models.ForeignKey(EmergencyReport, on_delete=models.CASCADE, related_name="notifications")
	title = models.CharField(max_length=120)
	message = models.TextField()
	is_read = models.BooleanField(default=False)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["-created_at"]


class CitizenProfile(models.Model):
	RISK_LOW = "LOW"
	RISK_MEDIUM = "MEDIUM"
	RISK_HIGH = "HIGH"
	RISK_EXTREME = "EXTREME"

	RISK_LEVEL_CHOICES = [
		(RISK_LOW, "Low"),
		(RISK_MEDIUM, "Medium"),
		(RISK_HIGH, "High"),
		(RISK_EXTREME, "Extreme"),
	]

	user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="citizen_profile")
	full_name = models.CharField(max_length=150, blank=True)
	contact_number = models.CharField(max_length=30, blank=True)
	home_address = models.TextField(blank=True)
	emergency_contact_name = models.CharField(max_length=150, blank=True)
	emergency_contact_number = models.CharField(max_length=30, blank=True)
	emergency_contact_relationship = models.CharField(max_length=80, blank=True)
	is_verified = models.BooleanField(default=False)
	is_suspended = models.BooleanField(default=False)
	is_flagged = models.BooleanField(default=False)
	suspension_reason = models.TextField(blank=True, default="")
	suspension_until = models.DateTimeField(null=True, blank=True)
	risk_score = models.IntegerField(null=True, blank=True)
	risk_level = models.CharField(
		max_length=10,
		choices=RISK_LEVEL_CHOICES,
		default=RISK_LOW,
	)
	last_risk_review_at = models.DateTimeField(null=True, blank=True)
	registration_ip = models.CharField(max_length=45, blank=True, default="")
	last_activity_ip = models.CharField(max_length=45, blank=True, default="")
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	def __str__(self):
		return f"Profile for {self.user.username}"


class EmergencyCategory(models.Model):
	UNIT_DRRM = "DRRM"
	UNIT_BFP = "BFP"
	UNIT_POLICE = "POLICE"

	SUGGESTED_UNIT_CHOICES = [
		(UNIT_DRRM, "DRRM"),
		(UNIT_BFP, "BFP"),
		(UNIT_POLICE, "POLICE"),
	]

	name = models.CharField(max_length=120, unique=True)
	description = models.TextField(blank=True)
	suggested_units = models.JSONField(default=list, blank=True)
	is_active = models.BooleanField(default=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["name"]
		verbose_name_plural = "Emergency categories"

	def __str__(self):
		return self.name
