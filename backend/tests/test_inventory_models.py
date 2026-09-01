from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from apps.inventory.models import Chemical, Container, Location, LocationTypes, validate_cas


@pytest.fixture
def location_type(db):
    return LocationTypes.objects.create(name="Shelf", slug="shelf")


@pytest.fixture
def chemical(db):
    return Chemical.objects.create(name="Water", cas="7732-18-5")


class TestValidateCas:
    def test_accepts_valid_cas(self):
        # Water — real, well-known CAS number with a correct check digit.
        validate_cas("7732-18-5")

    def test_rejects_bad_check_digit(self):
        with pytest.raises(ValidationError):
            validate_cas("7732-18-6")

    def test_rejects_malformed_input(self):
        with pytest.raises(ValidationError):
            validate_cas("not-a-cas-number")


@pytest.mark.django_db
class TestLocationTree:
    def test_full_path_joins_ancestor_names_root_first(self, location_type):
        building = Location.objects.create(name="Building", type=location_type)
        room = Location.objects.create(name="Room", type=location_type, parent=building)
        shelf = Location.objects.create(name="Shelf", type=location_type, parent=room)

        assert shelf.full_path == "Building Room Shelf"

    def test_rejects_self_as_parent(self, location_type):
        location = Location.objects.create(name="Loop", type=location_type)
        location.parent = location

        with pytest.raises(ValidationError):
            location.save()

    def test_rejects_descendant_as_parent(self, location_type):
        grandparent = Location.objects.create(name="Grandparent", type=location_type)
        parent = Location.objects.create(name="Parent", type=location_type, parent=grandparent)
        child = Location.objects.create(name="Child", type=location_type, parent=parent)

        grandparent.parent = child
        with pytest.raises(ValidationError):
            grandparent.save()


@pytest.mark.django_db
class TestContainerComputedFields:
    def _make_container(self, chemical, location, **overrides):
        defaults = {
            "name": "Test Container",
            "slug": "test-container",
            "chemical": chemical,
            "location": location,
        }
        defaults.update(overrides)
        return Container.objects.create(**defaults)

    def test_is_opened_reflects_date_opened(self, chemical, location_type):
        location = Location.objects.create(name="Shelf 1", type=location_type)
        unopened = self._make_container(chemical, location, slug="unopened")
        opened = self._make_container(chemical, location, slug="opened", date_opened="2026-01-01")

        assert unopened.is_opened is False
        assert opened.is_opened is True

    def test_quantity_combines_amount_and_unit(self, chemical, location_type):
        location = Location.objects.create(name="Shelf 1", type=location_type)
        container = self._make_container(
            chemical, location, initial_quantity=500, quantity_unit="mL"
        )

        assert container.quantity == "500 mL"

    def test_initial_content_mass_uses_density_for_volume_units(self, chemical, location_type):
        location = Location.objects.create(name="Shelf 1", type=location_type)
        container = self._make_container(
            chemical,
            location,
            initial_quantity=100,
            quantity_unit="mL",
            density=Decimal("1.50"),
        )

        # Volume units get converted to mass via density; mass units don't.
        assert container.initial_content_mass == Decimal("150.00")

    def test_initial_content_mass_ignores_density_for_mass_units(self, chemical, location_type):
        location = Location.objects.create(name="Shelf 1", type=location_type)
        container = self._make_container(
            chemical,
            location,
            initial_quantity=100,
            quantity_unit="g",
            density=Decimal("1.50"),
        )

        assert container.initial_content_mass == 100

    def test_has_estimated_usage_requires_tare_weight(self, chemical, location_type):
        location = Location.objects.create(name="Shelf 1", type=location_type)
        without_tare = self._make_container(chemical, location, slug="no-tare")
        with_tare = self._make_container(
            chemical, location, slug="with-tare", tare_weight=Decimal("12.5000")
        )

        assert without_tare.has_estimated_usage is False
        assert with_tare.has_estimated_usage is True

    def test_label_zero_pads_to_the_highest_pk_in_use(self, chemical, location_type):
        location = Location.objects.create(name="Shelf 1", type=location_type)
        first = self._make_container(chemical, location, slug="c1")
        for i in range(2, 12):
            self._make_container(chemical, location, slug=f"c{i}")

        # 10 containers exist by now, so pks run at least into two digits —
        # the first container's label should be padded to match.
        assert first.label == f"CHEM-{first.id:0>2}"
