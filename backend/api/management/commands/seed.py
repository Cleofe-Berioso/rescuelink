from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand
from django.apps import apps


class Command(BaseCommand):
    help = "Seed RescueLink demo accounts with one shared password."

    PASSWORD = "rescuelinkbest"

    USERS = [
        # Admin
        {
            "username": "admin",
            "email": "admin@rescuelink.local",
            "first_name": "System",
            "last_name": "Admin",
            "is_staff": True,
            "is_superuser": True,
            "groups": ["Admin"],
        },

        # Citizen
        {
            "username": "citizen",
            "email": "citizen@rescuelink.local",
            "first_name": "Citizen",
            "last_name": "User",
            "is_staff": False,
            "is_superuser": False,
            "groups": ["Citizen"],
        },

        # Response Units
        {
            "username": "drrm",
            "email": "drrm@rescuelink.local",
            "first_name": "DRRM",
            "last_name": "Unit",
            "is_staff": True,
            "is_superuser": False,
            "groups": ["Response Unit", "DRRM"],
        },
        {
            "username": "bfp",
            "email": "bfp@rescuelink.local",
            "first_name": "BFP",
            "last_name": "Unit",
            "is_staff": True,
            "is_superuser": False,
            "groups": ["Response Unit", "BFP"],
        },
        {
            "username": "pnp",
            "email": "pnp@rescuelink.local",
            "first_name": "PNP",
            "last_name": "Unit",
            "is_staff": True,
            "is_superuser": False,
            "groups": ["Response Unit", "PNP"],
        },
        {
            "username": "ambulance",
            "email": "ambulance@rescuelink.local",
            "first_name": "Ambulance",
            "last_name": "Unit",
            "is_staff": True,
            "is_superuser": False,
            "groups": ["Response Unit", "Ambulance"],
        },
        {
            "username": "hospital",
            "email": "hospital@rescuelink.local",
            "first_name": "Hospital",
            "last_name": "Unit",
            "is_staff": True,
            "is_superuser": False,
            "groups": ["Response Unit", "Hospital"],
        },
    ]

    def handle(self, *args, **options):
        User = get_user_model()

        for user_data in self.USERS:
            username = user_data["username"]

            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    "email": user_data["email"],
                    "first_name": user_data["first_name"],
                    "last_name": user_data["last_name"],
                    "is_staff": user_data["is_staff"],
                    "is_superuser": user_data["is_superuser"],
                    "is_active": True,
                },
            )

            user.email = user_data["email"]
            user.first_name = user_data["first_name"]
            user.last_name = user_data["last_name"]
            user.is_staff = user_data["is_staff"]
            user.is_superuser = user_data["is_superuser"]
            user.is_active = True
            user.set_password(self.PASSWORD)
            user.save()

            user.groups.clear()

            for group_name in user_data["groups"]:
                group, _ = Group.objects.get_or_create(name=group_name)
                user.groups.add(group)

            self.create_citizen_profile_if_needed(user, username)

            action = "Created" if created else "Updated"
            self.stdout.write(
                self.style.SUCCESS(
                    f"{action}: {username} / {self.PASSWORD}"
                )
            )

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("RescueLink seed completed."))
        self.stdout.write(self.style.WARNING(f"Shared password: {self.PASSWORD}"))

    def create_citizen_profile_if_needed(self, user, username):
        if username != "citizen":
            return

        try:
            CitizenProfile = apps.get_model("api", "CitizenProfile")
        except LookupError:
            return

        try:
            CitizenProfile.objects.get_or_create(user=user)
        except Exception:
            # If your CitizenProfile model has required fields,
            # this prevents the seed command from crashing.
            pass