from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Custom user model — always reference it via settings.AUTH_USER_MODEL.

    Defining a custom user on day one avoids a painful migration later.
    Project roles live here so permissions can key off ``user.role``.
    """

    class Role(models.TextChoices):
        LAB_MANAGER = "lab_manager", "Lab Manager"
        STOCKROOM = "stockroom", "Stockroom"
        VIEWER = "viewer", "Viewer"

    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.VIEWER)

    def __str__(self) -> str:
        return self.username
