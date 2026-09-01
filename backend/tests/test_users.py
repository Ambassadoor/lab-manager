import pytest
from rest_framework.test import APIClient

from apps.inventory.permissions import IsManager
from apps.users.models import User
from apps.users.serializers import NewUserSerializer


def _valid_registration(**overrides):
    data = {
        "email": "student@lipscomb.edu",
        "username": "student",
        "first_name": "New",
        "last_name": "Student",
        "password": "S3curePassword!",
        "lipscomb_id": "12345678901",
    }
    data.update(overrides)
    return data


@pytest.mark.django_db
class TestNewUserSerializerEmailValidation:
    @pytest.mark.parametrize("email", ["student@lipscomb.edu", "student@mail.lipscomb.edu"])
    def test_accepts_lipscomb_addresses(self, email):
        serializer = NewUserSerializer(data=_valid_registration(email=email))
        assert serializer.is_valid(), serializer.errors

    @pytest.mark.parametrize(
        "email",
        [
            "student@gmail.com",
            "student@lipscomb.edu.evil.com",
            "not-an-email",
        ],
    )
    def test_rejects_non_lipscomb_addresses(self, email):
        serializer = NewUserSerializer(data=_valid_registration(email=email))
        assert not serializer.is_valid()
        assert "email" in serializer.errors


@pytest.mark.django_db
class TestRegisterView:
    def test_creates_a_user_that_actually_passes_ismanager(self):
        # Regression test: RegisterView used to pass role="Lab Manager" (the
        # choice's display label) instead of "lab_manager" (the stored
        # value), so every self-registered user silently failed every
        # IsManager check forever. Assert on the real permission check, not
        # just the raw field, so this can't regress the same way again.
        client = APIClient()
        response = client.post("/api/auth/register/", _valid_registration(), format="json")

        assert response.status_code == 201
        user = User.objects.get(username="student")
        assert user.role == User.Role.LAB_MANAGER

        request = type("Request", (), {"user": user})()
        assert IsManager().has_permission(request, view=None) is True

    def test_rejects_non_lipscomb_email(self):
        client = APIClient()
        response = client.post(
            "/api/auth/register/",
            _valid_registration(email="student@gmail.com"),
            format="json",
        )

        assert response.status_code == 400
        assert not User.objects.filter(username="student").exists()


@pytest.mark.django_db
class TestValidateView:
    def test_new_email_and_available_username_pass(self):
        client = APIClient()
        response = client.get(
            "/api/auth/validate/",
            {"email": "fresh@lipscomb.edu", "username": "freshuser"},
        )

        assert response.status_code == 204

    def test_flags_taken_username_and_existing_email(self):
        User.objects.create_user(username="taken", email="taken@lipscomb.edu", password="pw12345!")
        client = APIClient()

        response = client.get(
            "/api/auth/validate/",
            {"email": "taken@lipscomb.edu", "username": "taken"},
        )

        assert response.status_code == 422
        assert "email" in response.data["errors"]
        assert "username" in response.data["errors"]
