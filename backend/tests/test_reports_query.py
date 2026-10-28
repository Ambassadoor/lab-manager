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
        make_container("ml", quantity_unit="ml")
        make_container("g", quantity_unit="g")
        make_container("l", quantity_unit="l")

        query = {"conditions": [{"field": "unit", "op": "is_any_of", "value": ["ml", "l"]}]}

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
