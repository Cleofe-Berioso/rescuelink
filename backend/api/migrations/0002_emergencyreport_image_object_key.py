# Generated manually for Supabase Storage migration

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="emergencyreport",
            name="image",
            field=models.CharField(blank=True, default="", max_length=512),
        ),
    ]
