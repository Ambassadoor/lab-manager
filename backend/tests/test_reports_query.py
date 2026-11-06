import pytest

from datetime import timedelta
from decimal import Decimal
from apps.reports.query import run_query
from django.utils import timezone
from apps.inventory.models import Container


@pytest.mark.django_db
class TestReportQuery:
    def test_empty_tare_weight_return(self, make_container):
        make_container("empty")
        make_container("tared", tare_weight=Decimal("120"))

        empty_tare_query = {
            "conditions": [
                {
                    "field": "tare_weight",
                    "op": "is_empty",
                }
            ]
        }

        results = run_query(empty_tare_query)
        assert {c.slug for c in results} == {"empty"}

    def test_name_query_is_case_insensitive(self, make_container):
        make_container("lower", name="sodium hydroxide")
        make_container("upper", name="Sodium Hydroxide")
        make_container("non_matching", name="Potassium Chloride")

        case_sensitive_query = {
            "conditions": [{"field": "name", "op": "contains", "value": "Sodium"}]
        }

        results = run_query(case_sensitive_query)
        assert {c.slug for c in results} == {"lower", "upper"}

    def test_returned_containers_match_all_queries(self, make_container):
        make_container("matches", name="Hydrogen Peroxide")
        make_container("doesn't match", name="Sulfur Dioxide", tare_weight=Decimal("120"))

        multi_query = {
            "conditions": [
                {"field": "name", "op": "contains", "value": "Hydrogen"},
                {
                    "field": "tare_weight",
                    "op": "is_empty",
                },
            ]
        }

        results = run_query(multi_query)
        assert {c.slug for c in results} == {"matches"}

    def test_is_not_empty_returns_neither_null_or_blank(self, make_container):
        make_container("null", manufacturer=None)
        make_container("blank", manufacturer="")
        make_container("not_empty", manufacturer="Fisher")

        query = {"conditions": [{"field": "manufacturer", "op": "is_not_empty"}]}

        results = run_query(query)
        assert {c.slug for c in results} == {"not_empty"}

    def test_quantity_unit_query(self, make_container):
        make_container("ml", quantity_unit="mL")
        make_container("g", quantity_unit="g")
        make_container("l", quantity_unit="L")

        query = {"conditions": [{"field": "unit", "op": "is_any_of", "value": ["mL", "L"]}]}

        results = run_query(query)
        assert {c.slug for c in results} == {"ml", "l"}

    def test_unknown_field_raises_value_error(self, make_container):
        make_container("first", name="Sodium Hydroxide")
        make_container("second", name="Potassium Chloride")

        query = {"conditions": [{"field": "Container_Name", "op": "contains", "value": "sodium"}]}

        with pytest.raises(ValueError):
            run_query(query)

    def test_tare_weight_is_empty_includes_lte_zero(self, make_container):
        make_container("positive", tare_weight=50)
        make_container("zero", tare_weight=0)
        make_container("negative", tare_weight=-5)
        make_container("null", tare_weight=None)

        query = {
            "conditions": [
                {
                    "field": "tare_weight",
                    "op": "is_empty",
                }
            ]
        }

        results = run_query(query)
        assert {c.slug for c in results} == {"zero", "negative", "null"}

    def test_tare_weight_equals_zero(self, make_container):
        make_container("zero", tare_weight=0)
        make_container("positive", tare_weight=20)

        query = {"conditions": [{"field": "tare_weight", "op": "eq", "value": 0}]}

        results = run_query(query)
        assert {c.slug for c in results} == {"zero"}

    def test_tare_weight_is_not_empty_excludes_lte_zero(self, make_container):
        make_container("positive", tare_weight=50)
        make_container("zero", tare_weight=0)
        make_container("negative", tare_weight=-5)
        make_container("null", tare_weight=None)

        query = {
            "conditions": [
                {
                    "field": "tare_weight",
                    "op": "is_not_empty",
                }
            ]
        }

        results = run_query(query)
        assert {c.slug for c in results} == {"positive"}

    def test_discarded_containers_are_not_returned(self, make_container):
        make_container(
            "active",
            name="Sodium Hydroxide",
        )
        make_container("inactive", name="Sodium Chloride", date_discarded="2026-10-15")

        query = {"conditions": [{"field": "name", "op": "contains", "value": "sodium"}]}

        results = run_query(query)
        assert {c.slug for c in results} == {"active"}

    def test_received_date_older_than_returns_nulls(self, make_container):
        today = timezone.localdate()

        make_container("older", date_received=today - timedelta(days=10))
        make_container("newer", date_received=today)
        make_container("null", date_received=None)

        query = {"conditions": [{"field": "date_received", "op": "older_than_days", "value": 1}]}

        results = run_query(query)

        assert {c.slug for c in results} == {"older", "null"}

    def test_received_date_before_returns_nulls(self, make_container):
        today = timezone.localdate()

        make_container("older", date_received=today - timedelta(days=10))
        make_container("newer", date_received=today)
        make_container("null", date_received=None)

        query = {"conditions": [{"field": "date_received", "op": "before", "value": today}]}

        results = run_query(query)

        assert {c.slug for c in results} == {"older", "null"}

    def test_created_at(self, make_container):
        now = timezone.localtime(timezone.now())
        ten_days_ago = now - timedelta(days=10)
        make_container("older")
        make_container("newer")

        Container.objects.filter(slug="older").update(created_at=ten_days_ago)

        query = {
            "conditions": [{"field": "created_at", "op": "before", "value": timezone.localdate()}]
        }

        results = run_query(query)

        assert {c.slug for c in results} == {"older"}

    def test_within_days(self, make_container):
        today = timezone.localdate()
        ten_days_ago = today - timedelta(days=10)
        five_days_ago = today - timedelta(days=5)

        make_container("ten", date_received=ten_days_ago)
        make_container("five", date_received=five_days_ago)
        make_container("today", date_received=today)

        query = {"conditions": [{"field": "date_received", "op": "within_days", "value": 5}]}

        results = run_query(query)

        assert {c.slug for c in results} == {"five", "today"}

    def test_date_on(self, make_container):
        today = timezone.localdate()
        ten_days_ago = today - timedelta(days=10)
        five_days_ago = today - timedelta(days=5)

        make_container("ten", date_received=ten_days_ago)
        make_container("five", date_received=five_days_ago)
        make_container("null", date_received=None)
        make_container("today", date_received=today)

        query = {"conditions": [{"field": "date_received", "op": "on", "value": today}]}

        results = run_query(query)

        assert {c.slug for c in results} == {"today"}

    def test_older_than_is_exclusive(self, make_container):
        today = timezone.localdate()
        ten_days_ago = today - timedelta(days=10)
        five_days_ago = today - timedelta(days=5)

        make_container("today", date_received=today)
        make_container("ten", date_received=ten_days_ago)
        make_container("five", date_received=five_days_ago)

        query = {"conditions": [{"field": "date_received", "op": "older_than_days", "value": 5}]}

        results = run_query(query)

        assert {c.slug for c in results} == {"ten"}

    def test_last_checked_out_older_than_days_365(self, make_container, make_checkout_event):
        four_hundred = make_container("four_hundred")
        ten = make_container("ten")
        make_container("never")

        now = timezone.localtime(timezone.now())
        make_checkout_event(four_hundred, now - timedelta(days=400))
        make_checkout_event(ten, now - timedelta(days=10))

        query = {"conditions": [{"field": "last_checkout", "op": "older_than_days", "value": 365}]}

        results = run_query(query)

        assert {c.slug for c in results} == {"four_hundred", "never"}

    def test_last_weighed_within_days_7(self, make_container, make_weight_reading):
        now = timezone.localtime(timezone.now())
        today = make_container("today")
        week = make_container("week")
        month = make_container("month")
        make_container("null")

        make_weight_reading(today, now, 10)
        make_weight_reading(week, now - timedelta(days=7), 20)
        make_weight_reading(month, now - timedelta(days=30), 30)

        query = {"conditions": [{"field": "last_weighed", "op": "within_days", "value": 7}]}

        results = run_query(query)

        assert {c.slug for c in results} == {"today", "week"}

    def test_current_weight_is_empty(self, make_container, make_weight_reading):
        now = timezone.localtime(timezone.now())
        make_container("null")

        exists = make_container("exists")
        make_weight_reading(exists, now, 100)

        query = {
            "conditions": [
                {
                    "field": "current_weight",
                    "op": "is_empty",
                }
            ]
        }

        results = run_query(query)

        assert {c.slug for c in results} == {"null"}

    def test_percent_remaining_lt(self, make_container, make_weight_reading):
        now = timezone.localtime(timezone.now())
        full = make_container("full", initial_quantity=50, tare_weight=50, quantity_unit="g")
        half = make_container(
            "half", initial_quantity=100, tare_weight=50, quantity_unit="mL", density=1
        )
        ten = make_container("ten", initial_quantity=100, tare_weight=10, quantity_unit="g")

        make_weight_reading(full, now, 100)
        make_weight_reading(half, now, 100)
        make_weight_reading(ten, now, 20)

        query = {"conditions": [{"field": "percent_remaining", "op": "lt", "value": 25}]}

        results = run_query(query)

        assert {c.slug for c in results} == {"ten"}


# Each case: initial quantity, unit, density, tare, latest weight (None = no reading)
PERCENT_CASES = {
    "grams": (100, "g", None, Decimal("50"), Decimal("75")),
    "milligrams": (500, "mg", None, Decimal("10"), Decimal("10.25")),
    "kilograms": (2, "kg", None, Decimal("400"), Decimal("1400")),
    "ml_density": (500, "mL", Decimal("0.79"), Decimal("200"), Decimal("397.5")),
    "litre": (1, "L", Decimal("0.789"), Decimal("400"), Decimal("794.5")),
    "rounds_half_up": (200, "g", None, Decimal("100"), Decimal("101")),
    "ml_no_density": (500, "mL", None, Decimal("200"), Decimal("400")),
    "no_unit": (100, None, None, Decimal("50"), Decimal("75")),
    "no_quantity": (None, "g", None, Decimal("50"), Decimal("75")),
    "zero_quantity": (0, "g", None, Decimal("50"), Decimal("75")),
    "no_tare": (100, "g", None, None, Decimal("75")),
    "zero_tare": (100, "g", None, Decimal("0"), Decimal("75")),
    "no_reading": (100, "g", None, Decimal("50"), None),
}


@pytest.mark.django_db
def test_percent_remaining_annotation_matches_the_property(make_container, make_weight_reading):
    from apps.reports.registry import percent_remaining

    now = timezone.now()
    for slug, (quantity, unit, density, tare, weight) in PERCENT_CASES.items():
        container = make_container(
            slug,
            initial_quantity=quantity,
            quantity_unit=unit,
            density=density,
            tare_weight=tare,
        )
        if weight is not None:
            # An older reading first, so the newest one has to win
            make_weight_reading(container, now - timedelta(days=5), Decimal("9999"))
            make_weight_reading(container, now, weight)

    annotated = Container.objects.annotate(percent=percent_remaining())
    results = {c.slug: (c.percent, c.percent_remaining) for c in annotated}

    for slug, (sql, python) in results.items():
        assert sql == python, f"{slug}: SQL gave {sql}, the property gives {python}"
    # A case that fails silently on both sides would prove nothing
    assert results["litre"][1] == 50
