import logging

from django.apps import AppConfig

logger = logging.getLogger("rescuelink.security")

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

    def ready(self):
        from django.conf import settings
        from django.contrib.auth import get_user_model

        if settings.DEBUG:
            return

        try:
            User = get_user_model()
            for username, password in KNOWN_DEMO_ACCOUNTS:
                try:
                    user = User.objects.get(username=username)
                except User.DoesNotExist:
                    continue
                if user.check_password(password):
                    logger.warning(
                        "Demo account '%s' still uses the default seed password. "
                        "Change it before production use.",
                        username,
                    )
        except Exception:
            pass
