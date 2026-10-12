import pytest

from apps.inventory.models import CheckoutEvent
from apps.users.models import User


def make_user(username, first, last, **extra):
    return User.objects.create_user(
        username=username,
        email=f"{username}@lipscomb.edu",
        password="pw12345!",
        first_name=first,
        last_name=last,
        **extra,
    )


@pytest.mark.django_db
class TestHolderDisplay:
    def test_falls_back_from_holder_to_name_to_recorder(self, make_container):
        jar = make_container("jar")
        worker = make_user("worker", "Stock", "Worker")
        student = make_user("student", "Ada", "Lovelace")

        old = CheckoutEvent.objects.create(container=jar, action="out", user=worker)
        named = CheckoutEvent.objects.create(
            container=jar, action="out", user=worker, holder_name="Grace Hopper"
        )
        matched = CheckoutEvent.objects.create(
            container=jar, action="out", user=worker, holder=student, holder_name="ignored"
        )

        assert old.holder_display == "Stock Worker"
        assert named.holder_display == "Grace Hopper"
        assert matched.holder_display == "Ada Lovelace"

    def test_checkout_status_shows_holder_but_not_their_id(self, client_as, make_container):
        jar = make_container("jar")
        worker = make_user("worker", "Stock", "Worker")
        CheckoutEvent.objects.create(
            container=jar,
            action="out",
            user=worker,
            holder_name="Grace Hopper",
            holder_lipscomb_id="L12345678",
        )

        response = client_as("lab_assistant").get("/api/inventory/containers/jar/")

        status = response.data["checkout_status"]
        assert status["holder_display"] == "Grace Hopper"
        assert "holder_lipscomb_id" not in status


@pytest.mark.django_db
class TestUserLookup:
    URL = "/api/auth/users/lookup/"

    def test_finds_a_user_by_lipscomb_id(self, client_as):
        student = make_user("student", "Ada", "Lovelace", lipscomb_id="L12345678")

        response = client_as("stockroom").get(self.URL, {"lipscomb_id": "l1234 5678"})

        assert response.status_code == 200
        assert response.data == {"id": student.id, "full_name": "Ada Lovelace"}

    def test_unknown_id_is_404(self, client_as):
        response = client_as("stockroom").get(self.URL, {"lipscomb_id": "L00000000"})

        assert response.status_code == 404

    def test_malformed_id_is_400(self, client_as):
        response = client_as("stockroom").get(self.URL, {"lipscomb_id": "nope"})

        assert response.status_code == 400

    def test_lab_assistant_cannot_look_up(self, client_as):
        assert client_as("lab_assistant").get(self.URL, {"lipscomb_id": "L1"}).status_code == 403

    def test_stockroom_still_cannot_list_users(self, client_as):
        assert client_as("stockroom").get("/api/auth/users/").status_code == 403
