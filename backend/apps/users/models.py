from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Custom user model — always reference it via settings.AUTH_USER_MODEL.

    Defining a custom user on day one avoids a painful migration later.
    Project roles live here so permissions can key off ``user.role``.
    """

    class Role(models.TextChoices):
        LAB_MANAGER = "lab_manager", "Lab Manager"
        COORDINATOR = "coordinator", "Coordinator"
        STOCKROOM = "stockroom", "Stockroom"
        VIEWER = "viewer", "Viewer"

    class UserType(models.TextChoices):
        FULL = (
            "full",
            "Full User",
        )
        GUEST = "guest", "Guest"

    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.VIEWER)
    user_type = models.CharField(max_length=10, choices=UserType.choices, default=UserType.FULL)
    scanned_id = models.CharField(max_length=11, unique=True, null=True, blank=True)

    def __str__(self) -> str:
        return self.username or self.scanned_id or f"Guest {self.pk}"

    @property
    def is_guest(self):
        return self.user_type == self.UserType.GUEST
