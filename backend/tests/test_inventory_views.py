from datetime import date
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.inventory.models import (
    Chemical,
    ChemicalStorageCategories,
    Container,
    Location,
    LocationTypes,
)
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


@pytest.mark.django_db
class TestContainerFilters:
    def test_filters_by_manufacturer_icontains(self, client, make_container):
        sigma = make_container("sigma-jar", manufacturer="Sigma-Aldrich")
        make_container("fisher-jar", manufacturer="Fisher Scientific")

        response = client.get("/inventory/containers/?manufacturer=sigma")

        assert response.status_code == 200
        slugs = {c["slug"] for c in response.data}
        assert slugs == {sigma.slug}

    def test_filters_by_chemical(self, client, chemical, make_container):
        acetone = Chemical.objects.create(name="Acetone", cas="67-64-1")
        water_container = make_container("water-jar")
        make_container("acetone-jar", chemical=acetone)

        response = client.get(f"/inventory/containers/?chemical={chemical.id}")

        assert response.status_code == 200
        slugs = {c["slug"] for c in response.data}
        assert slugs == {water_container.slug}

    def test_filters_by_location(self, client, make_location, make_container):
        shelf_a = make_location("shelf-a")
        shelf_b = make_location("shelf-b")
        on_a = make_container("on-a", location=shelf_a)
        make_container("on-b", location=shelf_b)

        response = client.get(f"/inventory/containers/?location={shelf_a.id}")

        assert response.status_code == 200
        slugs = {c["slug"] for c in response.data}
        assert slugs == {on_a.slug}

    def test_filters_by_quantity_unit(self, client, make_container):
        ml = make_container("ml-jar", quantity_unit="mL")
        make_container("kg-jar", quantity_unit="kg")

        response = client.get("/inventory/containers/?quantity_unit=mL")

        assert response.status_code == 200
        slugs = {c["slug"] for c in response.data}
        assert slugs == {ml.slug}

    def test_filters_by_is_opened(self, client, make_container):
        opened = make_container("opened-jar", date_opened=date(2026, 1, 1))
        make_container("unopened-jar")

        response = client.get("/inventory/containers/?is_opened=true")

        assert response.status_code == 200
        slugs = {c["slug"] for c in response.data}
        assert slugs == {opened.slug}

    def test_filters_by_is_discarded(self, client, make_container):
        make_container("kept-jar")
        discarded = make_container("discarded-jar", date_discarded=date(2026, 1, 1))

        response = client.get("/inventory/containers/?is_discarded=true")

        assert response.status_code == 200
        slugs = {c["slug"] for c in response.data}
        assert slugs == {discarded.slug}

    def test_filters_by_has_estimated_usage(self, client, make_container):
        # A zero tare_weight is treated the same as "missing" (matches
        # Container.has_estimated_usage — see migration
        # 0026_null_placeholder_zero_tare_weights).
        real_tare = make_container("real-tare-jar", tare_weight=Decimal("12.5000"))
        make_container("no-tare-jar")
        make_container("zero-tare-jar", tare_weight=Decimal("0.0000"))

        response = client.get("/inventory/containers/?has_estimated_usage=true")

        assert response.status_code == 200
        slugs = {c["slug"] for c in response.data}
        assert slugs == {real_tare.slug}

    def test_filters_by_checkout_status(self, client, make_container):
        checked_out = make_container("out-jar")
        checked_in = make_container("in-jar")

        client.post("/inventory/containers/check_out/", [checked_out.slug], format="json")
        client.post("/inventory/containers/check_out/", [checked_in.slug], format="json")
        client.post("/inventory/containers/check_in/", [checked_in.slug], format="json")

        response = client.get("/inventory/containers/?checkout_status=out")

        assert response.status_code == 200
        slugs = {c["slug"] for c in response.data}
        assert slugs == {checked_out.slug}

    def test_filters_by_date_received_range(self, client, make_container):
        early = make_container("early-jar", date_received=date(2025, 1, 1))
        make_container("late-jar", date_received=date(2026, 6, 1))

        response = client.get(
            "/inventory/containers/?date_received_after=2024-12-01&date_received_before=2025-06-01"
        )

        assert response.status_code == 200
        slugs = {c["slug"] for c in response.data}
        assert slugs == {early.slug}

    def test_search_matches_name(self, client, make_container):
        target = make_container("beaker-42")
        make_container("flask-7")

        response = client.get("/inventory/containers/?search=beaker")

        assert response.status_code == 200
        slugs = {c["slug"] for c in response.data}
        assert slugs == {target.slug}


@pytest.mark.django_db
class TestChemicalFilters:
    def test_filters_by_cas_icontains(self, client, chemical):
        acetone = Chemical.objects.create(name="Acetone", cas="67-64-1")

        response = client.get("/inventory/chemicals/?cas=67-64")

        assert response.status_code == 200
        ids = {c["id"] for c in response.data}
        assert ids == {acetone.id}

    def test_filters_by_name_icontains(self, client, chemical):
        response = client.get("/inventory/chemicals/?name=wat")

        assert response.status_code == 200
        ids = {c["id"] for c in response.data}
        assert ids == {chemical.id}

    def test_filters_by_storage_category(self, client, chemical):
        flammable = ChemicalStorageCategories.objects.create(
            shorthand="FLM", description="Flammable", help_text="Keep away from heat."
        )
        acetone = Chemical.objects.create(name="Acetone", cas="67-64-1", storage_category=flammable)

        response = client.get(f"/inventory/chemicals/?storage_category={flammable.id}")

        assert response.status_code == 200
        ids = {c["id"] for c in response.data}
        assert ids == {acetone.id}

    def test_filters_by_is_organic(self, client, chemical):
        acetone = Chemical.objects.create(name="Acetone", cas="67-64-1", is_organic=True)
        chemical.is_organic = False
        chemical.save()

        response = client.get("/inventory/chemicals/?is_organic=true")

        assert response.status_code == 200
        ids = {c["id"] for c in response.data}
        assert ids == {acetone.id}

    def test_search_matches_name(self, client, chemical):
        response = client.get("/inventory/chemicals/?search=wat")

        assert response.status_code == 200
        ids = {c["id"] for c in response.data}
        assert ids == {chemical.id}


@pytest.mark.django_db
class TestLocationFilters:
    def test_filters_by_name_icontains(self, client, make_location):
        room = make_location("chem-room")
        make_location("storage-closet")

        response = client.get("/inventory/locations/?name=chem")

        assert response.status_code == 200
        ids = {loc["id"] for loc in response.data}
        assert ids == {room.id}

    def test_filters_by_type(self, client, make_location, location_type):
        other_type = LocationTypes.objects.create(name="Cabinet", slug="cabinet")
        shelf = make_location("shelf-a")
        cabinet = Location.objects.create(name="cabinet-b", type=other_type)
        cabinet.barcode = f"LOC-{cabinet.id}"
        cabinet.save()

        response = client.get(f"/inventory/locations/?type={location_type.id}")

        assert response.status_code == 200
        ids = {loc["id"] for loc in response.data}
        assert shelf.id in ids
        assert cabinet.id not in ids

    def test_ordering_by_name_descending(self, client, make_location):
        make_location("aaa-first")
        make_location("zzz-last")

        response = client.get("/inventory/locations/?ordering=-name")

        assert response.status_code == 200
        names = [loc["name"] for loc in response.data]
        assert names.index("zzz-last") < names.index("aaa-first")
