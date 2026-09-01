from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.inventory.models import Chemical, Container, Location, LocationTypes
from apps.users.models import User


@pytest.fixture
def user(db):
    return User.objects.create_user(
        username="tester", email="tester@lipscomb.edu", password="pw12345!"
    )


@pytest.fixture
def client(user):
    api_client = APIClient()
    api_client.force_authenticate(user=user)
    return api_client


@pytest.fixture
def location_type(db):
    return LocationTypes.objects.create(name="Shelf", slug="shelf")


@pytest.fixture
def chemical(db):
    return Chemical.objects.create(name="Water", cas="7732-18-5")


@pytest.fixture
def make_location(location_type):
    def _make(name, parent=None):
        location = Location.objects.create(name=name, type=location_type, parent=parent)
        # Mirrors LocationView.create()/add_child(), which is what assigns
        # barcodes for real locations — tests build them directly, so set it
        # here too.
        location.barcode = f"LOC-{location.id}"
        location.save()
        return location

    return _make


@pytest.fixture
def make_container(chemical, make_location):
    def _make(slug, location=None, **overrides):
        location = location or make_location(f"{slug}-loc")
        defaults = {"name": slug, "slug": slug, "chemical": chemical, "location": location}
        defaults.update(overrides)
        return Container.objects.create(**defaults)

    return _make


@pytest.mark.django_db
class TestContainerTransfer:
    def test_moves_containers_to_the_new_location(self, client, make_location, make_container):
        origin = make_location("origin")
        destination = make_location("destination")
        c1 = make_container("c1", location=origin)
        c2 = make_container("c2", location=origin)

        response = client.patch(
            "/inventory/containers/transfer/",
            # Uppercased/whitespace-padded like a real barcode scan would be.
            {
                "containers": [{"slug": f" {c1.slug.upper()} "}, {"slug": c2.slug}],
                "location": destination.id,
            },
            format="json",
        )

        assert response.status_code == 200
        c1.refresh_from_db()
        c2.refresh_from_db()
        assert c1.location_id == destination.id
        assert c2.location_id == destination.id

    def test_rejects_unknown_slug_without_moving_anything(
        self, client, make_location, make_container
    ):
        origin = make_location("origin")
        destination = make_location("destination")
        c1 = make_container("c1", location=origin)

        response = client.patch(
            "/inventory/containers/transfer/",
            {
                "containers": [{"slug": c1.slug}, {"slug": "does-not-exist"}],
                "location": destination.id,
            },
            format="json",
        )

        assert response.status_code == 400
        assert "does-not-exist" in response.data["detail"]
        c1.refresh_from_db()
        assert c1.location_id == origin.id


@pytest.mark.django_db
class TestLocationMove:
    def test_reparents_locations_under_the_new_parent(self, client, make_location):
        old_parent = make_location("old-parent")
        new_parent = make_location("new-parent")
        child = make_location("child", parent=old_parent)

        response = client.patch(
            "/inventory/locations/move/",
            {
                "childLocations": [{"slug": child.barcode}],
                "parentLocation": new_parent.barcode.lower(),
            },
            format="json",
        )

        assert response.status_code == 200
        child.refresh_from_db()
        assert child.parent_id == new_parent.id

    def test_rejects_moving_a_location_under_its_own_descendant(self, client, make_location):
        grandparent = make_location("grandparent")
        parent = make_location("parent", parent=grandparent)
        child = make_location("child", parent=parent)

        response = client.patch(
            "/inventory/locations/move/",
            {
                "childLocations": [{"slug": grandparent.barcode}],
                "parentLocation": child.barcode,
            },
            format="json",
        )

        assert response.status_code == 400
        grandparent.refresh_from_db()
        assert grandparent.parent_id is None

    def test_rejects_unknown_parent_barcode(self, client, make_location):
        child = make_location("child")

        response = client.patch(
            "/inventory/locations/move/",
            {"childLocations": [{"slug": child.barcode}], "parentLocation": "loc-999999"},
            format="json",
        )

        assert response.status_code == 400


@pytest.mark.django_db
class TestWeighInBulk:
    def test_records_a_reading_and_checks_the_container_in(self, client, make_container):
        container = make_container("c1")

        response = client.post(
            "/inventory/containers/weigh_in_bulk/",
            {"checkin": [{"slug": container.slug.upper(), "weight": "12.3400"}]},
            format="json",
        )

        assert response.status_code == 201
        assert container.readings.count() == 1
        assert container.readings.first().weight == Decimal("12.3400")
        assert container.events.filter(action="in").exists()

    def test_links_the_check_in_to_the_most_recent_check_out(self, client, make_container):
        container = make_container("c1")

        checkout_response = client.post(
            "/inventory/containers/check_out/", [container.slug], format="json"
        )
        assert checkout_response.status_code == 201
        checkout_event_id = checkout_response.data["events"][0]["id"]

        response = client.post(
            "/inventory/containers/weigh_in_bulk/",
            {"checkin": [{"slug": container.slug, "weight": "5.0000"}]},
            format="json",
        )

        assert response.status_code == 201
        in_event = container.events.get(action="in")
        assert in_event.related_event_id == checkout_event_id

    def test_rejects_unknown_slug(self, client, make_container):
        response = client.post(
            "/inventory/containers/weigh_in_bulk/",
            {"checkin": [{"slug": "does-not-exist", "weight": "1.0"}]},
            format="json",
        )

        assert response.status_code == 400

    def test_backfills_tare_weight_when_container_has_none(self, client, make_container):
        container = make_container("c1")
        assert container.has_estimated_usage is False

        response = client.post(
            "/inventory/containers/weigh_in_bulk/",
            {"checkin": [{"slug": container.slug, "weight": "10.0000", "tare_weight": "3.5000"}]},
            format="json",
        )

        assert response.status_code == 201
        container.refresh_from_db()
        assert container.tare_weight == Decimal("3.5000")

    def test_does_not_overwrite_an_existing_tare_weight(self, client, make_container):
        container = make_container("c1", tare_weight=Decimal("12.0000"))

        response = client.post(
            "/inventory/containers/weigh_in_bulk/",
            {"checkin": [{"slug": container.slug, "weight": "10.0000", "tare_weight": "99.0000"}]},
            format="json",
        )

        assert response.status_code == 201
        container.refresh_from_db()
        assert container.tare_weight == Decimal("12.0000")
