import pytest

from apps.inventory.models import SDS, Chemical, ChemicalStorageCategories
from apps.inventory.storage_rules import check_storage_conflicts
from apps.users.models import User


@pytest.fixture
def make_chemical(db):
    def _make(name, cas=None, storage_category=None):
        return Chemical.objects.create(name=name, cas=cas, storage_category=storage_category)

    return _make


@pytest.fixture
def make_storage_category(db):
    def _make(shorthand, description=""):
        return ChemicalStorageCategories.objects.create(
            shorthand=shorthand, description=description, help_text=""
        )

    return _make


def attach_sds(container, *ghs_pictograms):
    return SDS.objects.create(
        container=container, file_name="sds.pdf", drive_id="x", ghs_pictograms=list(ghs_pictograms)
    )


@pytest.mark.django_db
class TestOrganicInorganicRule:
    def test_no_conflict_in_empty_location(
        self, make_chemical, make_storage_category, make_location
    ):
        organic = make_chemical("Ethanol", storage_category=make_storage_category("O2"))
        location = make_location("shelf")

        assert check_storage_conflicts(organic, location) == []

    def test_organic_conflicts_with_existing_inorganic(
        self, make_chemical, make_storage_category, make_location, make_container
    ):
        inorganic = make_chemical("Sodium Chloride", storage_category=make_storage_category("I2"))
        location = make_location("shelf")
        make_container("existing", location=location, chemical=inorganic)
        organic = make_chemical("Ethanol", storage_category=make_storage_category("O2"))

        warnings = check_storage_conflicts(organic, location)

        assert len(warnings) == 1
        assert "Sodium Chloride" in warnings[0]

    def test_inorganic_conflicts_with_existing_organic(
        self, make_chemical, make_storage_category, make_location, make_container
    ):
        organic = make_chemical("Ethanol", storage_category=make_storage_category("O2"))
        location = make_location("shelf")
        make_container("existing", location=location, chemical=organic)
        inorganic = make_chemical("Sodium Chloride", storage_category=make_storage_category("I2"))

        warnings = check_storage_conflicts(inorganic, location)

        assert len(warnings) == 1
        assert "Ethanol" in warnings[0]

    def test_same_category_type_does_not_conflict(
        self, make_chemical, make_storage_category, make_location, make_container
    ):
        # Two different organic categories (O1 vs O2) — both organic, no rule broken.
        acid = make_chemical("Acetic Acid", storage_category=make_storage_category("O1"))
        location = make_location("shelf")
        make_container("existing", location=location, chemical=acid)
        alcohol = make_chemical("Ethanol", storage_category=make_storage_category("O2"))

        assert check_storage_conflicts(alcohol, location) == []

    def test_no_conflict_when_category_unset(self, make_chemical, make_location, make_container):
        unknown = make_chemical("Mystery Compound")
        location = make_location("shelf")
        make_container("existing", location=location, chemical=unknown)
        other_unknown = make_chemical("Another Mystery")

        assert check_storage_conflicts(other_unknown, location) == []


@pytest.mark.django_db
class TestFlammableOxidizerRule:
    def test_flammable_conflicts_with_existing_oxidizer(
        self, make_chemical, make_location, make_container
    ):
        oxidizer = make_chemical("Hydrogen Peroxide")
        location = make_location("shelf")
        oxidizer_container = make_container("existing", location=location, chemical=oxidizer)
        attach_sds(oxidizer_container, "oxidizing")
        flammable = make_chemical("Acetone")
        # Needs a container of its own for _hazard_sets_by_chemical's SDS
        # lookup to find anything — a chemical with no container can't
        # have an SDS (SDS.container is a required FK).
        flammable_container = make_container(
            "incoming", location=make_location("elsewhere"), chemical=flammable
        )
        attach_sds(flammable_container, "flammable")

        warnings = check_storage_conflicts(flammable, location)

        assert len(warnings) == 1
        assert "Hydrogen Peroxide" in warnings[0]

    def test_oxidizer_conflicts_with_existing_flammable(
        self, make_chemical, make_location, make_container
    ):
        flammable = make_chemical("Acetone")
        location = make_location("shelf")
        flammable_container = make_container("existing", location=location, chemical=flammable)
        attach_sds(flammable_container, "flammable")
        oxidizer = make_chemical("Hydrogen Peroxide")
        oxidizer_container = make_container(
            "incoming", location=make_location("elsewhere"), chemical=oxidizer
        )
        attach_sds(oxidizer_container, "oxidizing")

        warnings = check_storage_conflicts(oxidizer, location)

        assert len(warnings) == 1
        assert "Acetone" in warnings[0]

    def test_two_flammables_do_not_conflict(self, make_chemical, make_location, make_container):
        flammable_a = make_chemical("Acetone")
        location = make_location("shelf")
        container_a = make_container("existing", location=location, chemical=flammable_a)
        attach_sds(container_a, "flammable")
        flammable_b = make_chemical("Ethanol")
        container_b = make_container(
            "incoming", location=make_location("elsewhere"), chemical=flammable_b
        )
        attach_sds(container_b, "flammable")

        assert check_storage_conflicts(flammable_b, location) == []

    def test_no_conflict_without_sds(self, make_chemical, make_location, make_container):
        # No SDS at all means no documented hazards to conflict over.
        chem_a = make_chemical("Chemical A")
        location = make_location("shelf")
        make_container("existing", location=location, chemical=chem_a)
        chem_b = make_chemical("Chemical B")

        assert check_storage_conflicts(chem_b, location) == []


@pytest.mark.django_db
class TestNitricAcidRule:
    NITRIC_ACID_CAS = "7697-37-2"

    def test_nitric_acid_conflicts_with_any_other_container(
        self, make_chemical, make_location, make_container
    ):
        other = make_chemical("Sulfuric Acid", cas="7664-93-9")
        location = make_location("shelf")
        make_container("existing", location=location, chemical=other)
        nitric_acid = make_chemical("Nitric Acid", cas=self.NITRIC_ACID_CAS)

        warnings = check_storage_conflicts(nitric_acid, location)

        assert len(warnings) == 1
        assert "Nitric Acid" in warnings[0]

    def test_other_chemical_conflicts_with_existing_nitric_acid(
        self, make_chemical, make_location, make_container
    ):
        nitric_acid = make_chemical("Nitric Acid", cas=self.NITRIC_ACID_CAS)
        location = make_location("shelf")
        make_container("existing", location=location, chemical=nitric_acid)
        other = make_chemical("Sulfuric Acid", cas="7664-93-9")

        warnings = check_storage_conflicts(other, location)

        assert len(warnings) == 1
        assert "Nitric Acid" in warnings[0]

    def test_nitric_acid_alone_does_not_conflict(self, make_chemical, make_location):
        nitric_acid = make_chemical("Nitric Acid", cas=self.NITRIC_ACID_CAS)
        location = make_location("shelf")

        assert check_storage_conflicts(nitric_acid, location) == []

    def test_nitric_acid_does_not_conflict_with_itself(
        self, make_chemical, make_location, make_container
    ):
        # "separately from all other chemicals" - not from more of itself.
        # Chemical.cas is unique, so two Nitric Acid containers necessarily
        # share the same Chemical row - this is the case a naive "any other
        # container at all" check (the bug this rule used to have) would
        # wrongly flag.
        nitric_acid = make_chemical("Nitric Acid", cas=self.NITRIC_ACID_CAS)
        location = make_location("shelf")
        make_container("existing", location=location, chemical=nitric_acid)

        assert check_storage_conflicts(nitric_acid, location) == []


@pytest.mark.django_db
class TestExcludeContainer:
    def test_excludes_the_container_being_checked(
        self, make_chemical, make_storage_category, make_location, make_container
    ):
        # Re-saving a container's own current location shouldn't warn
        # about conflicting with itself.
        organic = make_chemical("Ethanol", storage_category=make_storage_category("O2"))
        location = make_location("shelf")
        container = make_container("existing", location=location, chemical=organic)

        warnings = check_storage_conflicts(organic, location, exclude_container_id=container.id)

        assert warnings == []


@pytest.mark.django_db
class TestAlsoPlacing:
    """also_placing covers a bulk transfer's *other* containers, not yet
    saved at the destination - conflicts among the batch itself, not just
    against what's already there."""

    def test_conflicts_with_a_sibling_not_yet_saved(
        self, make_chemical, make_storage_category, make_location
    ):
        # Empty destination - nothing pre-existing to conflict with, but
        # the two chemicals arriving together conflict with each other.
        organic = make_chemical("Ethanol", storage_category=make_storage_category("O2"))
        inorganic = make_chemical("Sodium Chloride", storage_category=make_storage_category("I2"))
        location = make_location("shelf")

        warnings = check_storage_conflicts(organic, location, also_placing=[inorganic])

        assert len(warnings) == 1
        assert "Sodium Chloride" in warnings[0]

    def test_no_conflict_when_batch_is_empty(self, make_chemical, make_location):
        chemical = make_chemical("Water")
        location = make_location("shelf")

        assert check_storage_conflicts(chemical, location, also_placing=[]) == []

    def test_same_chemical_in_batch_does_not_conflict_with_itself(
        self, make_chemical, make_location
    ):
        nitric_acid = make_chemical("Nitric Acid", cas="7697-37-2")
        location = make_location("shelf")

        # Two containers of the same Nitric Acid moving together.
        assert check_storage_conflicts(nitric_acid, location, also_placing=[nitric_acid]) == []


@pytest.mark.django_db
class TestContainerViewStorageConflicts:
    def test_update_requires_confirmation_and_does_not_save(
        self, client_as, make_chemical, make_storage_category, make_location, make_container
    ):
        inorganic = make_chemical("Sodium Chloride", storage_category=make_storage_category("I2"))
        target = make_location("target")
        make_container("existing", location=target, chemical=inorganic)
        organic = make_chemical("Ethanol", storage_category=make_storage_category("O2"))
        container = make_container("moving", chemical=organic)
        original_location_id = container.location_id
        client = client_as(User.Role.STOCKROOM)

        response = client.patch(
            f"/inventory/containers/{container.slug}/",
            {"location": target.id},
            format="json",
        )

        assert response.status_code == 409
        assert response.data["requires_confirmation"] is True
        assert len(response.data["warnings"]) == 1
        container.refresh_from_db()
        assert container.location_id == original_location_id

    def test_update_confirmed_saves_despite_conflict(
        self, client_as, make_chemical, make_storage_category, make_location, make_container
    ):
        inorganic = make_chemical("Sodium Chloride", storage_category=make_storage_category("I2"))
        target = make_location("target")
        make_container("existing", location=target, chemical=inorganic)
        organic = make_chemical("Ethanol", storage_category=make_storage_category("O2"))
        container = make_container("moving", chemical=organic)
        client = client_as(User.Role.STOCKROOM)

        response = client.patch(
            f"/inventory/containers/{container.slug}/",
            {"location": target.id, "confirm_storage_conflicts": True},
            format="json",
        )

        assert response.status_code == 200
        container.refresh_from_db()
        assert container.location_id == target.id

    def test_update_without_location_change_ignores_rules(
        self, client_as, make_chemical, make_storage_category, make_location, make_container
    ):
        inorganic = make_chemical("Sodium Chloride", storage_category=make_storage_category("I2"))
        target = make_location("target")
        make_container("existing", location=target, chemical=inorganic)
        organic = make_chemical("Ethanol", storage_category=make_storage_category("O2"))
        container = make_container("moving", location=target, chemical=organic)
        client = client_as(User.Role.STOCKROOM)

        # Already in `target` (fixture put it there directly) — editing an
        # unrelated field shouldn't re-trigger a warning about a location
        # that isn't changing.
        response = client.patch(
            f"/inventory/containers/{container.slug}/",
            {"manufacturer": "Acme"},
            format="json",
        )

        assert response.status_code == 200

    def test_transfer_aggregates_warnings_across_the_batch(
        self, client_as, make_chemical, make_storage_category, make_location, make_container
    ):
        inorganic = make_chemical("Sodium Chloride", storage_category=make_storage_category("I2"))
        target = make_location("target")
        make_container("existing", location=target, chemical=inorganic)
        organic = make_chemical("Ethanol", storage_category=make_storage_category("O2"))
        moving = make_container("moving", chemical=organic)
        client = client_as(User.Role.STOCKROOM)

        response = client.patch(
            "/inventory/containers/transfer/",
            {"containers": [{"slug": moving.slug}], "location": target.id},
            format="json",
        )

        assert response.status_code == 409
        assert len(response.data["warnings"]) == 1

        confirmed = client.patch(
            "/inventory/containers/transfer/",
            {
                "containers": [{"slug": moving.slug}],
                "location": target.id,
                "confirm_storage_conflicts": True,
            },
            format="json",
        )
        assert confirmed.status_code == 200
        moving.refresh_from_db()
        assert moving.location_id == target.id

    def test_transfer_checks_batch_members_against_each_other(
        self, client_as, make_chemical, make_storage_category, make_location, make_container
    ):
        # Empty destination - neither container conflicts with anything
        # already there, only with the other one arriving in the same
        # request.
        organic = make_chemical("Ethanol", storage_category=make_storage_category("O2"))
        inorganic = make_chemical("Sodium Chloride", storage_category=make_storage_category("I2"))
        target = make_location("target")
        moving_organic = make_container("moving-organic", chemical=organic)
        moving_inorganic = make_container("moving-inorganic", chemical=inorganic)
        client = client_as(User.Role.STOCKROOM)

        response = client.patch(
            "/inventory/containers/transfer/",
            {
                "containers": [{"slug": moving_organic.slug}, {"slug": moving_inorganic.slug}],
                "location": target.id,
            },
            format="json",
        )

        assert response.status_code == 409
        assert len(response.data["warnings"]) == 2

    def test_transfer_of_same_chemical_batch_does_not_self_conflict(
        self, client_as, make_chemical, make_location, make_container
    ):
        # Two containers of the same Nitric Acid moving together to an
        # empty location shouldn't trip "must be stored separately."
        nitric_acid = make_chemical("Nitric Acid", cas="7697-37-2")
        target = make_location("target")
        moving_a = make_container("moving-a", chemical=nitric_acid)
        moving_b = make_container("moving-b", chemical=nitric_acid)
        client = client_as(User.Role.STOCKROOM)

        response = client.patch(
            "/inventory/containers/transfer/",
            {
                "containers": [{"slug": moving_a.slug}, {"slug": moving_b.slug}],
                "location": target.id,
            },
            format="json",
        )

        assert response.status_code == 200

    def test_create_requires_confirmation(
        self, client_as, make_chemical, make_storage_category, make_location, make_container
    ):
        inorganic = make_chemical("Sodium Chloride", storage_category=make_storage_category("I2"))
        target = make_location("target")
        make_container("existing", location=target, chemical=inorganic)
        organic_category = make_storage_category("O2")
        client = client_as(User.Role.STOCKROOM)
        payload = {
            "multiple_cas": False,
            "chemicals": [
                {
                    "cas": "64-17-5",
                    "name": "Ethanol",
                    "storage_category": organic_category.id,
                }
            ],
            "name": "new-organic",
            "location": target.id,
            "initial_quantity": 1,
            "quantity_unit": "mL",
            "initial_weight": "1",
            "tare_weight": "1",
        }

        response = client.post("/inventory/containers/", payload, format="json")

        assert response.status_code == 409
        assert response.data["requires_confirmation"] is True
