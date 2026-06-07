from django.db import migrations, models


DEFAULT_CATEGORIES = [
	{
		"name": "Fire Incident",
		"description": "Active fire requiring BFP response.",
		"suggested_units": ["BFP"],
	},
	{
		"name": "Smoke Report",
		"description": "Smoke without confirmed flames; verify and respond as needed.",
		"suggested_units": ["BFP"],
	},
	{
		"name": "Road Accident",
		"description": "Vehicle collision or traffic incident.",
		"suggested_units": ["DRRM", "POLICE"],
	},
	{
		"name": "Crime/Violence",
		"description": "Crime, assault, or violent incident.",
		"suggested_units": ["POLICE"],
	},
	{
		"name": "Flooding",
		"description": "Flood water, evacuation, or disaster response.",
		"suggested_units": ["DRRM"],
	},
	{
		"name": "Trapped Person",
		"description": "Person trapped and requiring rescue.",
		"suggested_units": ["DRRM", "BFP"],
	},
]


def seed_categories(apps, schema_editor):
	EmergencyCategory = apps.get_model("api", "EmergencyCategory")
	for item in DEFAULT_CATEGORIES:
		EmergencyCategory.objects.get_or_create(name=item["name"], defaults=item)


def unseed_categories(apps, schema_editor):
	EmergencyCategory = apps.get_model("api", "EmergencyCategory")
	names = [item["name"] for item in DEFAULT_CATEGORIES]
	EmergencyCategory.objects.filter(name__in=names).delete()


class Migration(migrations.Migration):
	dependencies = [
		("api", "0003_citizenprofile"),
	]

	operations = [
		migrations.CreateModel(
			name="EmergencyCategory",
			fields=[
				("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
				("name", models.CharField(max_length=120, unique=True)),
				("description", models.TextField(blank=True)),
				("suggested_units", models.JSONField(blank=True, default=list)),
				("is_active", models.BooleanField(default=True)),
				("created_at", models.DateTimeField(auto_now_add=True)),
				("updated_at", models.DateTimeField(auto_now=True)),
			],
			options={
				"ordering": ["name"],
				"verbose_name_plural": "Emergency categories",
			},
		),
		migrations.RunPython(seed_categories, unseed_categories),
	]
