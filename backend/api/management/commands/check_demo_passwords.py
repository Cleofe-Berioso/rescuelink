from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from api.apps import KNOWN_DEMO_ACCOUNTS


class Command(BaseCommand):
    help = (
        "Check whether known demo accounts still use default seed passwords. "
        "Exits with code 1 if any matches are found."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--warn-only",
            action="store_true",
            help="Print warnings but exit with code 0.",
        )

    def handle(self, *args, **options):
        User = get_user_model()
        warn_only = options["warn_only"]
        matches = []

        for username, password in KNOWN_DEMO_ACCOUNTS:
            try:
                user = User.objects.get(username=username)
            except User.DoesNotExist:
                continue
            if user.check_password(password):
                matches.append(username)

        if not matches:
            self.stdout.write(self.style.SUCCESS("No demo accounts use default seed passwords."))
            return

        for username in matches:
            self.stderr.write(
                self.style.WARNING(
                    f"Demo account '{username}' still uses the default seed password."
                )
            )

        if warn_only:
            return

        raise SystemExit(1)
