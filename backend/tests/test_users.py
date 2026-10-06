import pytest
from rest_framework.test import APIClient

from apps.users.models import User
from apps.users.permissions import role_at_least
from apps.users.serializers import NewUserSerializer


def _valid_registration(**overrides):
    data = {
        "email": "student@lipscomb.edu",
        "username": "student",
        "first_name": "New",
        "last_name": "Student",
        "password": "S3curePassword!",
        "lipscomb_id": "L12345678",
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
    def test_new_account_starts_at_the_lowest_role(self):
        # Regression test: RegisterView used to save every new account as
        # Lab Manager, so anyone who could reach the sign-up page got full
        # access. Assert on the real permission checks, not just the raw
        # field, so a role stored in the wrong form can't pass unnoticed.
        client = APIClient()
        response = client.post("/api/auth/register/", _valid_registration(), format="json")

        assert response.status_code == 201
        assert response.data["role"] == User.Role.LAB_ASSISTANT
        user = User.objects.get(username="student")
        assert user.role == User.Role.LAB_ASSISTANT

        request = type("Request", (), {"user": user})()
        assert role_at_least(User.Role.LAB_ASSISTANT)().has_permission(request, view=None) is True
        assert role_at_least(User.Role.STOCKROOM)().has_permission(request, view=None) is False

    def test_new_account_cannot_reach_user_management(self):
        client = APIClient()
        client.post("/api/auth/register/", _valid_registration(), format="json")
        assert client.login(username="student", password="S3curePassword!")

        assert client.get("/api/auth/users/").status_code == 403

    def test_role_in_the_request_body_is_ignored(self):
        client = APIClient()
        response = client.post(
            "/api/auth/register/", _valid_registration(role="lab_manager"), format="json"
        )

        assert response.status_code == 201
        assert User.objects.get(username="student").role == User.Role.LAB_ASSISTANT

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


# client_as now lives in conftest.py, shared with test_inventory_views.py/
# test_sds.py.


@pytest.mark.django_db
@pytest.mark.django_db
class TestLipscombIdNormalization:
    # Issue #89: spaces in the L# weren't removed, so "L1234 5678" failed the
    # format check or was stored with the spaces in it.

    @pytest.mark.parametrize("typed", ["L1234 5678", " l12345678 ", "L 1234\t5678"])
    def test_registration_stores_the_id_without_spaces(self, typed):
        response = APIClient().post(
            "/api/auth/register/", _valid_registration(lipscomb_id=typed), format="json"
        )

        assert response.status_code == 201
        assert User.objects.get(username="student").lipscomb_id == "L12345678"

    @pytest.mark.parametrize("typed", ["12345678", "L1234567", "X12345678", "L1234567A"])
    def test_registration_rejects_other_formats(self, typed):
        response = APIClient().post(
            "/api/auth/register/", _valid_registration(lipscomb_id=typed), format="json"
        )

        assert response.status_code == 400
        assert "lipscomb_id" in response.data

    def test_blank_ids_are_stored_as_null_so_they_dont_collide(self, client, user):
        # lipscomb_id is unique: two accounts saved with "" would conflict.
        response = client.patch("/api/auth/me/", {"lipscomb_id": "   "}, format="json")

        assert response.status_code == 200
        user.refresh_from_db()
        assert user.lipscomb_id is None

    def test_profile_edit_is_normalized_too(self, client, user):
        response = client.patch("/api/auth/me/", {"lipscomb_id": "l0000 0002"}, format="json")

        assert response.status_code == 200
        user.refresh_from_db()
        assert user.lipscomb_id == "L00000002"


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
class TestUserView:
    @pytest.mark.parametrize(
        "role",
        [User.Role.LAB_ASSISTANT, User.Role.STOCKROOM, User.Role.COORDINATOR, User.Role.FACULTY],
    )
    def test_roles_below_lab_manager_cannot_list_retrieve_or_update(self, client_as, user, role):
        client = client_as(role)

        assert client.get("/api/auth/users/").status_code == 403
        assert client.get(f"/api/auth/users/{user.id}/").status_code == 403
        assert (
            client.patch(
                f"/api/auth/users/{user.id}/", {"role": "admin"}, format="json"
            ).status_code
            == 403
        )
        user.refresh_from_db()
        assert user.role == User.Role.COORDINATOR

    @pytest.mark.parametrize("role", [User.Role.LAB_MANAGER, User.Role.ADMIN])
    def test_lab_manager_and_admin_can_list_and_view_other_users(self, client_as, user, role):
        client = client_as(role)

        list_response = client.get("/api/auth/users/")
        assert list_response.status_code == 200
        assert user.username in {u["username"] for u in list_response.data}

        detail_response = client.get(f"/api/auth/users/{user.id}/")
        assert detail_response.status_code == 200
        assert detail_response.data["username"] == user.username

    @pytest.mark.parametrize("role", [User.Role.LAB_MANAGER, User.Role.ADMIN])
    def test_lab_manager_and_admin_can_change_another_users_role_and_identity(
        self, client_as, user, role
    ):
        client = client_as(role)

        response = client.patch(
            f"/api/auth/users/{user.id}/",
            {"role": "admin", "first_name": "Renamed"},
            format="json",
        )

        assert response.status_code == 200
        user.refresh_from_db()
        assert user.role == User.Role.ADMIN
        assert user.first_name == "Renamed"

    def test_rejects_a_non_lipscomb_email(self, client_as, user):
        client = client_as(User.Role.LAB_MANAGER)

        response = client.patch(
            f"/api/auth/users/{user.id}/", {"email": "person@gmail.com"}, format="json"
        )

        assert response.status_code == 400
        user.refresh_from_db()
        assert user.email == "tester@lipscomb.edu"

    def test_allows_saving_without_changing_the_target_users_email(self, client_as, user):
        # Same UniqueValidator-self-exclusion regression guard as TestMeView,
        # here for UserAdminSerializer's independent field declaration.
        client = client_as(User.Role.LAB_MANAGER)

        response = client.patch(
            f"/api/auth/users/{user.id}/", {"first_name": "Updated"}, format="json"
        )

        assert response.status_code == 200


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
