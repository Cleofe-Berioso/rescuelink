from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("api", "0002_emergencyreport_image_object_key"),
    ]

    operations = [
        migrations.CreateModel(
            name="CitizenProfile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("full_name", models.CharField(blank=True, max_length=150)),
                ("contact_number", models.CharField(blank=True, max_length=30)),
                ("home_address", models.TextField(blank=True)),
                ("emergency_contact_name", models.CharField(blank=True, max_length=150)),
                ("emergency_contact_number", models.CharField(blank=True, max_length=30)),
                ("emergency_contact_relationship", models.CharField(blank=True, max_length=80)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="citizen_profile",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
    ]
