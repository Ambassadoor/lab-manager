from datetime import date

import pytest

from apps.inventory.models import Container

DISCARDED_ON = date(2026, 1, 1)


@pytest.fixture
def reader(client_as):
    return client_as("lab_assistant")


def slugs(response):
    return {c["slug"] for c in response.data}


@pytest.mark.django_db
class TestDiscardedHiddenFromLists:
    def test_list_hides_discarded(self, reader, make_container):
        make_container("kept")
        make_container("gone", date_discarded=DISCARDED_ON)

        response = reader.get("/api/inventory/containers/")

        assert response.status_code == 200
        assert slugs(response) == {"kept"}

    def test_is_discarded_true_lists_only_discarded(self, reader, make_container):
        make_container("kept")
        make_container("gone", date_discarded=DISCARDED_ON)

        assert slugs(reader.get("/api/inventory/containers/?is_discarded=true")) == {"gone"}
        assert slugs(reader.get("/api/inventory/containers/?is_discarded=false")) == {"kept"}

    def test_retrieve_still_opens_discarded(self, reader, make_container):
        make_container("gone", date_discarded=DISCARDED_ON)

        response = reader.get("/api/inventory/containers/gone/")

        assert response.status_code == 200
        assert response.data["date_discarded"] == "2026-01-01"

    def test_location_containers_hide_discarded(self, reader, make_container, make_location):
        shelf = make_location("Shelf A")
        make_container("kept", location=shelf)
        make_container("gone", location=shelf, date_discarded=DISCARDED_ON)

        response = reader.get(f"/api/inventory/locations/{shelf.id}/containers/")

        assert response.status_code == 200
        assert {c["slug"] for c in response.data["containers"]} == {"kept"}

    def test_dashboard_hides_discarded(self, reader, make_container):
        make_container("kept", date_received=date(2026, 2, 1))
        make_container("gone", date_received=date(2026, 3, 1), date_discarded=DISCARDED_ON)

        response = reader.get("/api/inventory/dashboard/")

        assert response.status_code == 200
        assert {c["slug"] for c in response.data["recently_added"]} == {"kept"}

    def test_active_queryset(self, make_container):
        make_container("kept")
        make_container("gone", date_discarded=DISCARDED_ON)

        assert set(Container.objects.active().values_list("slug", flat=True)) == {"kept"}


@pytest.mark.django_db
class TestDiscardAndRestore:
    def test_stockroom_cannot_discard(self, client_as, make_container):
        make_container("jar")

        response = client_as("stockroom").post("/api/inventory/containers/jar/discard/")

        assert response.status_code == 403
        assert Container.objects.get(slug="jar").date_discarded is None

    def test_coordinator_discards_today_by_default(self, client_as, make_container):
        make_container("jar")

        response = client_as("coordinator").post("/api/inventory/containers/jar/discard/")

        assert response.status_code == 200
        jar = Container.objects.get(slug="jar")
        assert jar.date_discarded is not None
        assert jar.discarded_by.username == "user-coordinator"
        assert response.data["discarded_by"]["full_name"] is not None

    def test_discard_on_a_given_date(self, client_as, make_container):
        make_container("jar")

        response = client_as("coordinator").post(
            "/api/inventory/containers/jar/discard/",
            {"date": "2026-01-01"},
            format="json",
        )

        assert response.status_code == 200
        assert response.data["date_discarded"] == "2026-01-01"

    def test_future_date_rejected(self, client_as, make_container):
        make_container("jar")

        response = client_as("coordinator").post(
            "/api/inventory/containers/jar/discard/", {"date": "2999-01-01"}, format="json"
        )

        assert response.status_code == 400

    def test_discarding_twice_is_refused(self, client_as, make_container):
        make_container("jar", date_discarded=DISCARDED_ON)

        response = client_as("coordinator").post("/api/inventory/containers/jar/discard/")

        assert response.status_code == 400

    def test_restore(self, client_as, make_container):
        make_container("jar", date_discarded=DISCARDED_ON)
        coordinator = client_as("coordinator")

        response = coordinator.post("/api/inventory/containers/jar/restore/")

        assert response.status_code == 200
        jar = Container.objects.get(slug="jar")
        assert jar.date_discarded is None
        assert jar.discarded_by is None
        assert coordinator.post("/api/inventory/containers/jar/restore/").status_code == 400


@pytest.mark.django_db
class TestDiscardedCantBeUsed:
    @pytest.fixture
    def stockroom(self, client_as):
        return client_as("stockroom")

    def test_check_out(self, stockroom, make_container):
        make_container("gone", date_discarded=DISCARDED_ON)

        response = stockroom.post(
            "/api/inventory/containers/check_out/",
            {"containers": ["gone"], "holder": {"name": "Test Holder"}},
            format="json",
        )

        assert response.status_code == 400
        assert "Discarded" in response.data["detail"]

    def test_check_in(self, stockroom, make_container):
        make_container("gone", date_discarded=DISCARDED_ON)

        response = stockroom.post("/api/inventory/containers/check_in/", ["gone"], format="json")

        assert response.status_code == 400

    def test_transfer(self, stockroom, make_container, make_location):
        make_container("gone", date_discarded=DISCARDED_ON)
        shelf = make_location("Shelf B")

        response = stockroom.patch(
            "/api/inventory/containers/transfer/",
            {"containers": [{"slug": "gone"}], "location": shelf.id},
            format="json",
        )

        assert response.status_code == 400
        assert "Discarded" in response.data["detail"]

    def test_weigh_in(self, stockroom, make_container):
        make_container("gone", date_discarded=DISCARDED_ON)

        response = stockroom.post(
            "/api/inventory/containers/weigh_in_bulk/",
            {"checkin": [{"slug": "gone", "weight": "100"}]},
            format="json",
        )

        assert response.status_code == 400
        assert "Discarded" in response.data["detail"]

    def test_unknown_container_says_which(self, stockroom, db):
        response = stockroom.post(
            "/api/inventory/containers/check_out/",
            {"containers": ["nope"], "holder": {"name": "Test Holder"}},
            format="json",
        )

        assert response.status_code == 400
        assert "nope" in response.data["detail"]
