from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.inventory.models import CheckoutEvent, WeightReading
from apps.users.models import User


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
