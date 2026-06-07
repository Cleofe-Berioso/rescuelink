from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Seed RescueLink default users and roles"

    def handle(self, *args, **options):
        User = get_user_model()

        roles = [
            "CITIZEN",
            "DRRM",
            "BFP",
            "POLICE",
            "ADMIN",
        ]

        for role in roles:
            Group.objects.get_or_create(name=role)

        users = [
            {
                "username": "admin",
                "password": "admin1234",
                "email": "admin@rescuelink.local",
                "first_name": "System",
                "last_name": "Administrator",
                "group": "ADMIN",
                "is_staff": True,
                "is_superuser": True,
            },
            {
                "username": "drrm",
                "password": "drrm1234",
                "email": "drrm@rescuelink.local",
                "first_name": "DRRM",
                "last_name": "Personnel",
                "group": "DRRM",
                "is_staff": True,
                "is_superuser": False,
            },
            {
                "username": "bfp",
                "password": "bfp1234",
                "email": "bfp@rescuelink.local",
                "first_name": "BFP",
                "last_name": "Personnel",
                "group": "BFP",
                "is_staff": True,
                "is_superuser": False,
            },
            {
                "username": "police",
                "password": "police1234",
                "email": "police@rescuelink.local",
                "first_name": "Police",
                "last_name": "Personnel",
                "group": "POLICE",
                "is_staff": True,
                "is_superuser": False,
            },
            {
                "username": "citizen",
                "password": "citizen1234",
                "email": "citizen@rescuelink.local",
                "first_name": "Citizen",
                "last_name": "User",
                "group": "CITIZEN",
                "is_staff": False,
                "is_superuser": False,
            },
        ]

        for data in users:
            group_name = data.pop("group")
            password = data.pop("password")

            user, created = User.objects.get_or_create(
                username=data["username"],
                defaults=data,
            )

            for field, value in data.items():
                setattr(user, field, value)

            user.set_password(password)
            user.is_active = True
            user.save()

            group = Group.objects.get(name=group_name)
            user.groups.clear()
            user.groups.add(group)

            # If your custom User model has a role field, this sets it safely.
            if hasattr(user, "role"):
                user.role = group_name
                user.save(update_fields=["role"])

            status = "created" if created else "updated"
            self.stdout.write(
                self.style.SUCCESS(
                    f"{status}: {user.username} / {password} -> {group_name}"
                )
            )

        self.stdout.write(self.style.SUCCESS("RescueLink seed completed."))