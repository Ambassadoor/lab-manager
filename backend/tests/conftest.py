import pytest
from rest_framework.test import APIClient

from apps.inventory.models import Chemical, Container, Location, LocationTypes
from apps.users.models import User


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


@pytest.fixture
def client_as(db):
    """An authenticated APIClient for a fresh user with the given role."""

    def _make(role):
        api_client = APIClient()
        api_client.force_authenticate(
            user=User.objects.create_user(
                username=f"user-{role}",
                email=f"{role}@lipscomb.edu",
                password="pw12345!",
                role=role,
            )
        )
        return api_client

    return _make
