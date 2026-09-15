from decimal import Decimal

import pytest

from apps.inventory.models import WeightReading
from apps.users.models import User


@pytest.fixture
def weigher(db):
    return User.objects.create_user(
        username="weigher", email="weigher@lipscomb.edu", password="pw12345!"
    )


def make_reading(container, weight, weigher):
    WeightReading.objects.create(container=container, weight=Decimal(weight), recorded_by=weigher)


@pytest.mark.django_db
class TestDashboardRestockSoon:
    # Regression test: DashboardView.restock_soon used to compute
    # weight / initial_weight directly in SQL — no tare-weight subtraction,
    # dividing by the whole container's initial weight (bottle included)
    # rather than just its content mass. A container whose empty bottle is
    # most of its initial_weight (like a large jug holding a little liquid)
    # would read as mostly-full under that formula even when almost none
    # of the actual chemical was left, so it never crossed the 10% cutoff.
    def test_uses_real_percent_remaining_not_raw_weight_ratio(
        self, client_as, make_container, weigher
    ):
        # Mirrors real data: a heavy bottle (tare 1669g) holding a modest
        # amount of liquid (content mass 3280g, initial_weight 4933g).
        # Raw ratio (1798.6 / 4933 ≈ 36%) stays well above the 10% cutoff;
        # the real formula ((1798.6 - 1669) / 3280 * 100 ≈ 4%) is well below it.
        container = make_container(
            "low-stock",
            initial_weight=Decimal("4933.0000"),
            tare_weight=Decimal("1669.0000"),
            initial_quantity=4000,
            quantity_unit="mL",
            density=Decimal("0.82"),
        )
        make_reading(container, "1798.6000", weigher)

        client = client_as(User.Role.LAB_ASSISTANT)
        response = client.get("/inventory/dashboard/")

        assert response.status_code == 200
        labels = {c["label"] for c in response.data["restock_soon"]}
        assert container.label in labels

    def test_excludes_containers_with_plenty_remaining(self, client_as, make_container, weigher):
        container = make_container(
            "plenty-left",
            initial_weight=Decimal("500.0000"),
            tare_weight=Decimal("100.0000"),
            initial_quantity=400,
            quantity_unit="g",
        )
        make_reading(container, "450.0000", weigher)  # (450-100)/400 = 87.5% remaining

        client = client_as(User.Role.LAB_ASSISTANT)
        response = client.get("/inventory/dashboard/")

        labels = {c["label"] for c in response.data["restock_soon"]}
        assert container.label not in labels

    def test_excludes_containers_with_no_reading_or_no_tare_weight(self, client_as, make_container):
        no_reading = make_container(
            "no-reading", initial_weight=Decimal("500.0000"), tare_weight=Decimal("100.0000")
        )
        no_tare = make_container("no-tare", initial_weight=Decimal("500.0000"))

        client = client_as(User.Role.LAB_ASSISTANT)
        response = client.get("/inventory/dashboard/")

        assert response.status_code == 200
        labels = {c["label"] for c in response.data["restock_soon"]}
        assert no_reading.label not in labels
        assert no_tare.label not in labels

    def test_orders_lowest_percent_remaining_first(self, client_as, make_container, weigher):
        fuller = make_container(
            "fuller",
            initial_weight=Decimal("500.0000"),
            tare_weight=Decimal("100.0000"),
            initial_quantity=400,
            quantity_unit="g",
        )
        make_reading(fuller, "140.0000", weigher)  # 10% remaining

        emptier = make_container(
            "emptier",
            initial_weight=Decimal("500.0000"),
            tare_weight=Decimal("100.0000"),
            initial_quantity=400,
            quantity_unit="g",
        )
        make_reading(emptier, "104.0000", weigher)  # 1% remaining

        client = client_as(User.Role.LAB_ASSISTANT)
        response = client.get("/inventory/dashboard/")

        labels = [c["label"] for c in response.data["restock_soon"]]
        assert labels.index(emptier.label) < labels.index(fuller.label)
