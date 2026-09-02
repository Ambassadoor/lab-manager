import pytest
from rest_framework.test import APIClient

from apps.inventory.permissions import role_at_least
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
    def test_creates_a_user_that_actually_passes_role_at_least_lab_manager(self):
        # Regression test: RegisterView used to pass role="Lab Manager" (the
        # choice's display label) instead of "lab_manager" (the stored
        # value), so every self-registered user silently failed every
        # role_at_least(LAB_MANAGER) check forever. Assert on the real
        # permission check, not just the raw field, so this can't regress
        # the same way again.
        client = APIClient()
        response = client.post("/api/auth/register/", _valid_registration(), format="json")

        assert response.status_code == 201
        user = User.objects.get(username="student")
        assert user.role == User.Role.LAB_MANAGER

        request = type("Request", (), {"user": user})()
        permission = role_at_least(User.Role.LAB_MANAGER)()
        assert permission.has_permission(request, view=None) is True

    def test_rejects_non_lipscomb_email(self):
        client = APIClient()
        response = client.post(
            "/api/auth/register/",
            _valid_registration(email="student@gmail.com"),
            format="json",
        )

        assert response.status_code == 400
        assert not User.objects.filter(username="student").exists()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        username="tester",
        email="tester@lipscomb.edu",
        password="pw12345!",
        first_name="Original",
        last_name="Name",
        lipscomb_id="L00000001",
        role=User.Role.COORDINATOR,
    )


@pytest.fixture
def client(user):
    api_client = APIClient()
    api_client.force_authenticate(user=user)
    return api_client


@pytest.mark.django_db
class TestMeView:
    def test_get_returns_own_profile_with_a_readable_role_label(self, client, user):
        response = client.get("/api/auth/me/")

        assert response.status_code == 200
        assert response.data["username"] == user.username
        assert response.data["role"] == "coordinator"
        assert response.data["role_display"] == "Coordinator"

    def test_patch_updates_own_editable_fields(self, client, user):
        response = client.patch(
            "/api/auth/me/",
            {"first_name": "Updated", "last_name": "Person", "lipscomb_id": "L00000002"},
            format="json",
        )

        assert response.status_code == 200
        user.refresh_from_db()
        assert user.first_name == "Updated"
        assert user.last_name == "Person"
        assert user.lipscomb_id == "L00000002"

    def test_patch_cannot_change_role(self, client, user):
        response = client.patch("/api/auth/me/", {"role": "admin"}, format="json")

        assert response.status_code == 200
        user.refresh_from_db()
        assert user.role == User.Role.COORDINATOR

    def test_patch_rejects_a_non_lipscomb_email(self, client, user):
        response = client.patch("/api/auth/me/", {"email": "tester@gmail.com"}, format="json")

        assert response.status_code == 400
        assert "email" in response.data
        user.refresh_from_db()
        assert user.email == "tester@lipscomb.edu"

    def test_patch_allows_saving_without_changing_own_email(self, client, user):
        # Regression guard: UserSerializer's email UniqueValidator must
        # exclude the current instance, or leaving email untouched on any
        # other field edit would spuriously fail as "already taken".
        response = client.patch("/api/auth/me/", {"first_name": "Updated"}, format="json")

        assert response.status_code == 200

    def test_unauthenticated_request_is_rejected(self):
        client = APIClient()
        response = client.patch("/api/auth/me/", {"first_name": "Nope"}, format="json")

        assert response.status_code == 403


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
