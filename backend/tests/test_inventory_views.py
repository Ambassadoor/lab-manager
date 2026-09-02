from datetime import date
from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
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


@pytest.mark.django_db
class TestLocationContainers:
    def test_includes_containers_from_all_descendant_locations(
        self, client, make_location, make_container
    ):
        root = make_location("root")
        child = make_location("child", parent=root)
        grandchild = make_location("grandchild", parent=child)
        sibling = make_location("sibling")

        in_root = make_container("in-root", location=root)
        in_child = make_container("in-child", location=child)
        in_grandchild = make_container("in-grandchild", location=grandchild)
        in_sibling = make_container("in-sibling", location=sibling)

        response = client.get(f"/inventory/locations/{root.id}/containers/")

        assert response.status_code == 200
        slugs = {c["slug"] for c in response.data["containers"]}
        assert slugs == {in_root.slug, in_child.slug, in_grandchild.slug}
        assert in_sibling.slug not in slugs

    def test_query_count_does_not_grow_with_tree_depth(self, client, make_location, make_container):
        # Regression guard for get_containers()'s old behavior: a recursive
        # obj.children.all() walk that fired one query per node visited, so
        # searching a subtree with many (even container-less) descendant
        # locations cost proportionally more queries than searching one
        # with none. The (id, parent_id) map + BFS version issues the same
        # fixed number of queries no matter how large that subtree is.
        #
        # The one container in each tree sits at a fixed-shape leaf — one
        # level below its own root, with no children of its own — kept
        # identical between the two trees on purpose: ContainerSerializer's
        # nested LocationSerializer separately walks each *result's own*
        # ancestor chain (full_path) and recursively serializes each
        # result's own descendant tree (children), both of which are
        # pre-existing costs unrelated to get_containers and would
        # otherwise contaminate this comparison. The extra 10-level chain
        # lives under deep_root but away from the container, so it's part
        # of the subtree get_containers must search, without changing the
        # shape of what actually gets serialized.
        shallow_root = make_location("shallow-root")
        shallow_leaf = make_location("shallow-leaf", parent=shallow_root)
        make_container("shallow-container", location=shallow_leaf)

        deep_root = make_location("deep-root")
        deep_leaf = make_location("deep-leaf", parent=deep_root)
        make_container("deep-container", location=deep_leaf)
        current = deep_root
        for i in range(10):
            current = make_location(f"level-{i}", parent=current)

        with CaptureQueriesContext(connection) as shallow_queries:
            shallow_response = client.get(f"/inventory/locations/{shallow_root.id}/containers/")
        with CaptureQueriesContext(connection) as deep_queries:
            deep_response = client.get(f"/inventory/locations/{deep_root.id}/containers/")

        assert shallow_response.status_code == 200
        assert deep_response.status_code == 200
        assert len(deep_queries) == len(shallow_queries)


@pytest.mark.django_db
class TestLocationTreeSerialization:
    def test_nests_children_alphabetically_with_correct_full_path_and_type(
        self, client, make_location, location_type
    ):
        root = make_location("alpha-root")
        make_location("zebra-child", parent=root)
        beta_child = make_location("beta-child", parent=root)
        make_location("gamma-grandchild", parent=beta_child)

        response = client.get("/inventory/locations/")

        assert response.status_code == 200
        root_data = next(loc for loc in response.data if loc["name"] == "alpha-root")

        assert root_data["full_path"] == "alpha-root"
        assert root_data["type"]["name"] == location_type.name

        # Children.all() (the old recursive implementation) inherited
        # Location.Meta.ordering = ["name"] for free — the new map-based walk
        # has to reproduce that explicitly.
        child_names = [c["name"] for c in root_data["children"]]
        assert child_names == ["beta-child", "zebra-child"]

        beta_data = next(c for c in root_data["children"] if c["name"] == "beta-child")
        assert beta_data["full_path"] == "alpha-root beta-child"
        assert [c["name"] for c in beta_data["children"]] == ["gamma-grandchild"]
        assert beta_data["children"][0]["full_path"] == "alpha-root beta-child gamma-grandchild"

        zebra_data = next(c for c in root_data["children"] if c["name"] == "zebra-child")
        assert zebra_data["children"] == []

    def test_query_count_does_not_grow_with_tree_size(self, client, make_location):
        # Regression guard for the old to_representation, which re-instantiated
        # LocationSerializer (and re-queried full_path/children/type) at every
        # tree level — so listing cost more queries as the tree grew. Same
        # request, same transaction, before/after growing the tree: the fixed
        # version should cost exactly the same either way.
        root = make_location("root")

        with CaptureQueriesContext(connection) as first_queries:
            first_response = client.get("/inventory/locations/")
        assert first_response.status_code == 200

        current = root
        for i in range(10):
            current = make_location(f"level-{i}", parent=current)

        with CaptureQueriesContext(connection) as second_queries:
            second_response = client.get("/inventory/locations/")
        assert second_response.status_code == 200

        assert len(second_queries) == len(first_queries)


@pytest.mark.django_db
class TestLocationMenu:
    def test_returns_correct_full_path_for_nested_locations(self, client, make_location):
        root = make_location("alpha-root")
        make_location("beta-child", parent=root)

        response = client.get("/inventory/locations/menu/")

        assert response.status_code == 200
        paths = {loc["name"]: loc["full_path"] for loc in response.data}
        assert paths["alpha-root"] == "alpha-root"
        assert paths["beta-child"] == "alpha-root beta-child"

    def test_query_count_does_not_grow_with_location_count(self, client, make_location):
        root = make_location("root")

        with CaptureQueriesContext(connection) as first_queries:
            first_response = client.get("/inventory/locations/menu/")
        assert first_response.status_code == 200

        current = root
        for i in range(10):
            current = make_location(f"level-{i}", parent=current)

        with CaptureQueriesContext(connection) as second_queries:
            second_response = client.get("/inventory/locations/menu/")
        assert second_response.status_code == 200

        assert len(second_queries) == len(first_queries)
