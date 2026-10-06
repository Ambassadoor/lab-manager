"""Finding 5 in docs/Post-MVP-Code-Review.md: the container and chemical
lists cost several queries per row. These tests pin the fix: the number of
queries must not grow with the number of rows, and the batched loading must
produce exactly what loading one container or chemical at a time does.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from apps.inventory.models import (
    SDS,
    Chemical,
    ChemicalStorageCategories,
    CheckoutEvent,
    Container,
    Ingredient,
    WeightReading,
)
from apps.inventory.serializers import ChemicalSerializer, ContainerSerializer
from apps.users.models import User

# A list request must stay within this many queries, whatever its size.
MAX_LIST_QUERIES = 8


@pytest.fixture
def user(db):
    return User.objects.create_user(
        username="manager",
        email="manager@lipscomb.edu",
        password="pw12345!",
        role=User.Role.LAB_MANAGER,
        first_name="Lab",
        last_name="Manager",
    )


@pytest.fixture
def client(user):
    api_client = APIClient()
    api_client.force_authenticate(user=user)
    return api_client


@pytest.fixture
def add_containers(make_container, chemical, user):
    """Adds containers with several readings, check-outs/ins and SDS each,
    so every "latest" field has older rows to skip over."""
    created = []

    def _add(count, chemical_=None):
        now = timezone.now()
        for _ in range(count):
            n = len(created)
            container = make_container(
                f"chem-{1000 + n}",
                chemical=chemical_ or chemical,
                initial_quantity=500,
                quantity_unit="g",
                initial_weight=Decimal("700"),
                tare_weight=Decimal("200"),
            )
            for hours_ago, weight in [(3, "650"), (2, "600"), (1, "250")]:
                reading = WeightReading.objects.create(
                    container=container, weight=Decimal(weight), recorded_by=user
                )
                # recorded_at is auto_now, so set it after creating.
                WeightReading.objects.filter(pk=reading.pk).update(
                    recorded_at=now - timedelta(hours=hours_ago)
                )
            for hours_ago, action in [(5, "out"), (4, "in"), (3, "out")]:
                event = CheckoutEvent.objects.create(container=container, action=action, user=user)
                CheckoutEvent.objects.filter(pk=event.pk).update(
                    timestamp=now - timedelta(hours=hours_ago)
                )
            for revision_date, revision_number in [
                (date(2020, 1, 1), "1"),
                (date(2024, 6, 1), "3"),
                (None, None),
                (date(2024, 6, 1), "3"),  # a tie with the row above
            ]:
                SDS.objects.create(
                    container=container,
                    file_name=f"{container.slug}.pdf",
                    drive_id=f"drive-{container.slug}",
                    revision_date=revision_date,
                    revision_number=revision_number,
                )
            created.append(container)
        return created

    return _add


def count_queries(client, url):
    with CaptureQueriesContext(connection) as queries:
        response = client.get(url)
    assert response.status_code == 200
    return len(queries)


@pytest.mark.django_db
class TestContainerListQueries:
    def test_query_count_does_not_grow_with_container_count(self, client, add_containers):
        add_containers(2)
        small = count_queries(client, "/api/inventory/containers/")
        add_containers(6)
        large = count_queries(client, "/api/inventory/containers/")

        assert large == small
        assert large <= MAX_LIST_QUERIES

    def test_location_containers_query_count_does_not_grow(
        self, client, add_containers, make_location
    ):
        shelf = make_location("shelf")
        for container in add_containers(2):
            container.location = shelf
            container.save()
        small = count_queries(client, f"/api/inventory/locations/{shelf.id}/containers/")
        for container in add_containers(6):
            container.location = shelf
            container.save()
        large = count_queries(client, f"/api/inventory/locations/{shelf.id}/containers/")

        assert large == small

    def test_batched_output_matches_one_at_a_time(self, add_containers, make_container):
        add_containers(4)
        make_container("chem-bare")  # no readings, events or SDS at all

        one_at_a_time = ContainerSerializer(Container.objects.order_by("pk"), many=True).data
        batched = ContainerSerializer(
            Container.objects.for_display().order_by("pk"), many=True
        ).data

        assert batched == one_at_a_time

    def test_latest_fields_pick_the_newest_rows(self, add_containers):
        (container,) = add_containers(1)

        data = ContainerSerializer(Container.objects.for_display().get(pk=container.pk)).data

        assert Decimal(data["latest_reading"]["weight"]) == Decimal("250")
        assert data["checkout_status"]["action"] == "out"
        # (250 - 200) / 500 g of content
        assert data["percent_remaining"] == Decimal("10")
        # Postgres sorts NULL first in a descending order, as before.
        assert data["latest_sds"]["revision_date"] is None


@pytest.mark.django_db
class TestChemicalListQueries:
    @pytest.fixture
    def add_chemicals(self, add_containers):
        category = ChemicalStorageCategories.objects.create(
            shorthand="I1", description="Metals", help_text=""
        )
        created = []

        def _add(count):
            for _ in range(count):
                n = len(created)
                chemical = Chemical.objects.create(name=f"Chemical {n}", storage_category=category)
                component = Chemical.objects.create(name=f"Component {n}")
                Ingredient.objects.create(mixture=chemical, ingredient=component)
                add_containers(2, chemical_=chemical)
                created.append(chemical)
            return created

        return _add

    def test_query_count_does_not_grow_with_chemical_count(self, client, add_chemicals):
        add_chemicals(2)
        small = count_queries(client, "/api/inventory/chemicals/")
        add_chemicals(6)
        large = count_queries(client, "/api/inventory/chemicals/")

        assert large == small
        assert large <= MAX_LIST_QUERIES

    def test_batched_output_matches_one_at_a_time(self, add_chemicals):
        add_chemicals(3)
        chemicals = Chemical.objects.order_by("pk")

        one_at_a_time = [ChemicalSerializer(chemical).data for chemical in chemicals]
        batched = ChemicalSerializer(chemicals, many=True).data

        assert [dict(row) for row in batched] == [dict(row) for row in one_at_a_time]
        assert any(row["sds"] for row in batched)


@pytest.mark.django_db
class TestDashboardQueries:
    def test_query_count_does_not_grow_with_restock_candidates(self, client, add_containers):
        add_containers(2)
        small = count_queries(client, "/api/inventory/dashboard/")
        add_containers(6)
        large = count_queries(client, "/api/inventory/dashboard/")

        assert large == small
