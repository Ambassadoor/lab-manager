from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.utils import timezone

from apps.inventory.models import SDS, CheckoutEvent, Container, WeightReading
from apps.users.models import User

LONG_AGO = timezone.now() - timedelta(days=30)


def backdate(model, pk):
    # updated_at is auto_now, so only .update() can set it to the past
    model.objects.filter(pk=pk).update(updated_at=LONG_AGO)


@pytest.fixture
def user(db):
    return User.objects.create_user(username="auditor", email="a@lipscomb.edu", password="pw")


@pytest.mark.django_db
class TestHistoryTimestampsAreSetOnce:
    # Resaving a reading or event must not move it in time: they're the
    # record of when something happened (code review finding 10)

    def test_weight_reading_keeps_recorded_at(self, make_container, user):
        reading = WeightReading.objects.create(
            container=make_container("jar"), weight=Decimal("100"), recorded_by=user
        )
        recorded_at = reading.recorded_at

        reading.weight = Decimal("90")
        reading.save()

        reading.refresh_from_db()
        assert reading.recorded_at == recorded_at

    def test_checkout_event_keeps_timestamp(self, make_container, user):
        event = CheckoutEvent.objects.create(
            container=make_container("jar"), action="out", user=user
        )
        earlier = timezone.now() - timedelta(days=1)
        CheckoutEvent.objects.filter(pk=event.pk).update(timestamp=earlier)
        event.refresh_from_db()

        event.action = "in"
        event.save()

        event.refresh_from_db()
        assert event.timestamp == earlier


@pytest.mark.django_db
class TestCreatedAndUpdatedAt:
    def test_set_on_create_and_updated_on_save(self, make_container):
        jar = make_container("jar")
        assert jar.created_at is not None
        created_at = jar.created_at
        backdate(Container, jar.pk)

        jar.refresh_from_db()
        jar.manufacturer = "Acme"
        jar.save()

        jar.refresh_from_db()
        assert jar.created_at == created_at
        assert jar.updated_at > LONG_AGO

    def test_discard_updates_updated_at(self, client_as, make_container):
        jar = make_container("jar")
        backdate(Container, jar.pk)

        client_as("coordinator").post("/api/inventory/containers/jar/discard/")

        jar.refresh_from_db()
        assert jar.updated_at > LONG_AGO

    @patch("apps.inventory.serializers.chemicals.rename_file")
    def test_sds_correction_updates_every_shared_row(self, mock_rename, client_as, make_container):
        rows = [
            SDS.objects.create(container=make_container(slug), file_name="a.pdf", drive_id="d-1")
            for slug in ("c1", "c2")
        ]
        for row in rows:
            backdate(SDS, row.pk)

        response = client_as("stockroom").patch(
            f"/api/inventory/sds/{rows[0].id}/", {"revision_number": "3"}, format="multipart"
        )

        assert response.status_code == 200
        for row in SDS.objects.filter(drive_id="d-1"):
            assert row.updated_at > LONG_AGO


@pytest.fixture
def logged_in():
    """A client with a real session login, as the browser has: the history
    middleware reads request.user, which force_authenticate doesn't set."""

    def _make(role):
        from rest_framework.test import APIClient

        user = User.objects.create_user(
            username=f"hist-{role}", email=f"h-{role}@lipscomb.edu", password="pw", role=role
        )
        client = APIClient()
        client.force_login(user)
        return client, user

    return _make


@pytest.mark.django_db
class TestChangeHistory:
    def test_container_change_is_recorded_with_who_and_what(self, logged_in, make_container):
        make_container("jar")
        client, coordinator = logged_in("coordinator")

        response = client.post("/api/inventory/containers/jar/discard/")

        assert response.status_code == 200
        latest = Container.objects.get(slug="jar").history.first()
        assert latest.history_type == "~"
        assert latest.history_user == coordinator
        changed = {c.field for c in latest.diff_against(latest.prev_record).changes}
        assert changed == {"date_discarded", "discarded_by"}

    @patch("apps.inventory.serializers.chemicals.rename_file")
    def test_sds_correction_is_recorded_on_every_shared_row(
        self, mock_rename, logged_in, make_container
    ):
        rows = [
            SDS.objects.create(container=make_container(slug), file_name="a.pdf", drive_id="d-1")
            for slug in ("c1", "c2")
        ]
        client, worker = logged_in("stockroom")

        client.patch(f"/api/inventory/sds/{rows[0].id}/", {"revision_number": "3"})

        for row in rows:
            latest = SDS.objects.get(pk=row.pk).history.first()
            assert latest.history_user == worker
            assert latest.revision_number == "3"
            assert latest.prev_record.revision_number is None
