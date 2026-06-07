from django.db import migrations, models


def remove_duplicate_unit_responses(apps, schema_editor):
	IncidentResponse = apps.get_model("api", "IncidentResponse")
	seen = set()
	for response in IncidentResponse.objects.order_by("accepted_at", "id"):
		key = (response.emergency_report_id, response.response_unit)
		if key in seen:
			response.delete()
		else:
			seen.add(key)


class Migration(migrations.Migration):
	dependencies = [
		("api", "0004_emergencycategory"),
	]

	operations = [
		migrations.RunPython(remove_duplicate_unit_responses, migrations.RunPython.noop),
		migrations.AddConstraint(
			model_name="incidentresponse",
			constraint=models.UniqueConstraint(
				fields=("emergency_report", "response_unit"),
				name="unique_report_unit_response",
			),
		),
	]
