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
