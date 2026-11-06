from datetime import timedelta

import pytest
from django.utils import timezone

from apps.inventory.models import Container
from apps.inventory.serializers import ContainerSerializer

FIELDS_URL = "/api/reports/fields/"
QUERY_URL = "/api/reports/query/"


def condition(field, op, value=None):
    body = {"field": field, "op": op}
    if value is not None:
        body["value"] = value
    return {"conditions": [body]}


@pytest.mark.django_db
class TestReportAPI:
    def test_lab_assistant_gets_403(self, client_as):
        client = client_as("lab_assistant")

        assert client.get(FIELDS_URL).status_code == 403
        assert (
            client.post(QUERY_URL, condition("name", "contains", "a"), format="json").status_code
            == 403
        )

    def test_fields_include_percent_remaining(self, client_as):
        response = client_as("stockroom").get(FIELDS_URL)

        assert response.status_code == 200
        assert "percent_remaining" in {field["key"] for field in response.data}

    def test_query_returns_serialized_containers(self, client_as, make_container):
        make_container("matches", name="matches")
        make_container("doesn't", name="doesn't")

        response = client_as("stockroom").post(
            QUERY_URL, condition("name", "contains", "match"), format="json"
        )

        expected = ContainerSerializer(
            Container.objects.filter(slug="matches").for_display(), many=True
        ).data
        assert response.status_code == 200
        assert response.data == expected

    def test_date_sent_as_a_json_string(self, client_as, make_container):
        # JSON has no date type, so the frontend sends dates as "YYYY-MM-DD"
        make_container("old")
        make_container("new")
        Container.objects.filter(slug="old").update(created_at=timezone.now() - timedelta(days=30))
        last_week = (timezone.localdate() - timedelta(days=7)).isoformat()

        response = client_as("stockroom").post(
            QUERY_URL, condition("created_at", "before", last_week), format="json"
        )

        assert response.status_code == 200
        assert {c["slug"] for c in response.data} == {"old"}

    def test_whole_days_sent_as_a_number(self, client_as, make_container):
        make_container("new")

        response = client_as("stockroom").post(
            QUERY_URL, condition("created_at", "within_days", 3), format="json"
        )

        assert response.status_code == 200
        assert {c["slug"] for c in response.data} == {"new"}

    def test_missing_conditions_returns_the_serializers_field_errors(self, client_as):
        response = client_as("stockroom").post(QUERY_URL, {}, format="json")

        assert response.status_code == 400
        # DRF's own shape, keyed by the field, not a string inside "detail"
        assert response.data == {"conditions": ["This field is required."]}


# Each case: the condition, and words its 400 message must contain, so a
# case can't pass by failing for some other reason (an unknown field, say)
BAD_CONDITIONS = {
    "number_is_text": (("tare_weight", "eq", "abc"), "must be a number"),
    "number_is_a_list": (("tare_weight", "eq", [1]), "must be a number"),
    "days_is_text": (("created_at", "within_days", "abc"), "must be a whole number"),
    "days_is_a_numeric_string": (("created_at", "within_days", "3"), "must be a whole number"),
    "days_is_a_fraction": (("created_at", "within_days", 1.5), "must be a whole number"),
    "date_is_text": (("created_at", "before", "abc"), "must be a date"),
    "date_is_a_number": (("created_at", "before", 5), "must be a date"),
    "value_missing": (("created_at", "before"), "missing values"),
    "unknown_field": (("created_on", "before", "2026-01-01"), "not supported"),
    "operator_wrong_for_type": (("tare_weight", "contains", "1"), "does not support"),
}


@pytest.mark.django_db
@pytest.mark.parametrize("case", BAD_CONDITIONS)
def test_bad_condition_returns_400_naming_the_problem(client_as, case):
    args, message = BAD_CONDITIONS[case]

    response = client_as("stockroom").post(QUERY_URL, condition(*args), format="json")

    assert response.status_code == 400
    assert message in response.data["detail"]
