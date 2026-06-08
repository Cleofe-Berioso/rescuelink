from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		("api", "0005_incidentresponse_unique_report_unit"),
	]

	operations = [
		migrations.AddField(
			model_name="emergencyreport",
			name="is_priority",
			field=models.BooleanField(default=False),
		),
		migrations.AddField(
			model_name="emergencyreport",
			name="priority_level",
			field=models.CharField(
				choices=[
					("LOW", "Low"),
					("MEDIUM", "Medium"),
					("HIGH", "High"),
					("CRITICAL", "Critical"),
				],
				default="LOW",
				max_length=10,
			),
		),
		migrations.AddField(
			model_name="emergencyreport",
			name="critical_level",
			field=models.CharField(
				choices=[
					("LOW", "Low"),
					("MEDIUM", "Medium"),
					("HIGH", "High"),
					("CRITICAL", "Critical"),
				],
				default="LOW",
				max_length=10,
			),
		),
		migrations.AddField(
			model_name="emergencyreport",
			name="ai_priority_reason",
			field=models.TextField(blank=True, default=""),
		),
		migrations.AddField(
			model_name="emergencyreport",
			name="detected_incident_type",
			field=models.CharField(blank=True, default="", max_length=120),
		),
		migrations.AddField(
			model_name="emergencyreport",
			name="suggested_units",
			field=models.JSONField(blank=True, default=list),
		),
		migrations.AddField(
			model_name="emergencyreport",
			name="ai_confidence",
			field=models.IntegerField(blank=True, null=True),
		),
		migrations.AddField(
			model_name="emergencyreport",
			name="ai_analyzed_at",
			field=models.DateTimeField(blank=True, null=True),
		),
		migrations.AddField(
			model_name="emergencyreport",
			name="ai_analysis_status",
			field=models.CharField(
				choices=[
					("not_analyzed", "Not analyzed"),
					("analyzed", "Analyzed"),
					("failed", "Failed"),
					("fallback", "Fallback"),
				],
				default="not_analyzed",
				max_length=20,
			),
		),
	]
