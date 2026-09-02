from django.contrib.auth.models import AbstractUser
from django.db import models


# Extends djano user module with additional fields
class User(AbstractUser):
    """Custom user model — always reference it via settings.AUTH_USER_MODEL.

    Defining a custom user on day one avoids a painful migration later.
    Project roles live here so permissions can key off ``user.role``.
    """

    class Role(models.TextChoices):
        # Admin and Lab Manager are, deliberately, the same permission tier
        # (see apps/inventory/permissions.py's ROLE_RANK) — kept as separate
        # values for future org flexibility, e.g. IT eventually holding
        # "Admin" while a non-technical person remains "Lab Manager".
        ADMIN = "admin", "Admin"
        LAB_MANAGER = "lab_manager", "Lab Manager"
        # Coordinator and Faculty share a rank too.
        COORDINATOR = "coordinator", "Coordinator"
        FACULTY = "faculty", "Faculty"
        STOCKROOM = "stockroom", "Stockroom Worker"
        LAB_ASSISTANT = "lab_assistant", "Lab Assistant"

    class UserType(models.TextChoices):
        FULL = (
            "full",
            "Full User",
        )
        GUEST = "guest", "Guest"

    email = models.EmailField(unique=True)
    # New accounts default to the bottom of the hierarchy — elevated access
    # is granted explicitly, never implicit in an unset role.
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.LAB_ASSISTANT)
    user_type = models.CharField(max_length=10, choices=UserType.choices, default=UserType.FULL)
    lipscomb_id = models.CharField(max_length=11, unique=True, null=True, blank=True)

    def __str__(self) -> str:
        return self.username or self.lipscomb_id or f"Guest {self.pk}"

    @property
    def is_guest(self):
        return self.user_type == self.UserType.GUEST
