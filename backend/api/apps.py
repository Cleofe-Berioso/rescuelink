from django.apps import AppConfig


KNOWN_DEMO_ACCOUNTS = (
    ("admin", "admin1234"),
    ("drrm", "drrm1234"),
    ("bfp", "bfp1234"),
    ("police", "police1234"),
    ("citizen", "citizen1234"),
)


class ApiConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "api"