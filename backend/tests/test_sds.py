from datetime import date
from unittest.mock import ANY, patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.inventory.models import Chemical, SDS
from apps.users.models import User


def make_pdf(name="sheet.pdf"):
    return SimpleUploadedFile(name, b"%PDF-1.4 fake sds content", content_type="application/pdf")


@pytest.fixture
def sds(make_container):
    container = make_container("c1", manufacturer="Acme", product_num="P-1")
    return SDS.objects.create(
        container=container,
        file_name="acme-p1.pdf",
        drive_id="drive-abc",
        revision_date=date(2024, 1, 1),
        revision_number=2,
    )


@pytest.mark.django_db
class TestSDSViewPermissions:
    def test_list_and_retrieve_are_fully_public(self, sds):
        # No force_authenticate at all — this has to work for an anonymous
        # visitor, matching the "fully public SDS viewing" decision.
        client = APIClient()
        assert client.get("/inventory/sds/").status_code == 200
        assert client.get(f"/inventory/sds/{sds.id}/").status_code == 200

    def test_create_denied_below_stockroom(self, client_as, make_container):
        client = client_as(User.Role.LAB_ASSISTANT)
        container = make_container("c1")

        response = client.post("/inventory/sds/", {"container": container.id, "file": make_pdf()})

        assert response.status_code == 403

    @pytest.mark.parametrize(
        "role",
        [
            User.Role.STOCKROOM,
            User.Role.COORDINATOR,
            User.Role.FACULTY,
            User.Role.LAB_MANAGER,
            User.Role.ADMIN,
        ],
    )
    @patch("apps.inventory.serializers.chemicals.upload_sds_file")
    def test_create_allowed_stockroom_and_up(self, mock_upload, client_as, make_container, role):
        mock_upload.return_value = "drive-xyz"
        client = client_as(role)
        container = make_container("c1")

        response = client.post("/inventory/sds/", {"container": container.id, "file": make_pdf()})

        assert response.status_code == 201

    @patch("apps.inventory.serializers.chemicals.upload_sds_file")
    def test_create_recognizes_a_real_session_login(self, mock_upload, make_container):
        # Regression test: SDSView used to set authentication_classes = []
        # at the class level (copied from RegisterView, whose only action
        # is genuinely public) — that left request.user as AnonymousUser
        # for every action, including create, so role_at_least denied every
        # request no matter the real user's role. Every other test here
        # uses client_as (force_authenticate), which bypasses the
        # authenticator pipeline entirely and can't catch that class of
        # bug — this logs in for real, the way the browser actually does.
        mock_upload.return_value = "drive-xyz"
        User.objects.create_user(
            username="real-login-manager",
            email="manager@lipscomb.edu",
            password="pw12345!",
            role=User.Role.LAB_MANAGER,
        )
        client = APIClient()
        assert client.login(username="real-login-manager", password="pw12345!")
        container = make_container("c1")

        response = client.post("/inventory/sds/", {"container": container.id, "file": make_pdf()})

        assert response.status_code == 201


@pytest.mark.django_db
class TestSDSFilter:
    def test_search_matches_chemical_name_cas_and_product_num(self, sds, make_container):
        client = APIClient()
        other_chemical = Chemical.objects.create(name="Ethanol", cas="64-17-5")
        SDS.objects.create(
            container=make_container(
                "other", chemical=other_chemical, manufacturer="Other Co", product_num="X-9"
            ),
            file_name="other.pdf",
            drive_id="drive-other",
        )

        assert len(client.get("/inventory/sds/?search=Water").data) == 1
        assert len(client.get("/inventory/sds/?search=7732-18-5").data) == 1
        assert len(client.get("/inventory/sds/?search=P-1").data) == 1

    def test_search_matches_chem_id_with_and_without_prefix(self, sds):
        client = APIClient()
        label = sds.container.label  # e.g. "CHEM-1"

        assert len(client.get(f"/inventory/sds/?search={label}").data) == 1
        assert len(client.get(f"/inventory/sds/?search={sds.container.id}").data) == 1

    def test_manufacturer_and_product_num_filters(self, sds, make_container):
        client = APIClient()
        SDS.objects.create(
            container=make_container("other", manufacturer="Other Co", product_num="X-9"),
            file_name="other.pdf",
            drive_id="drive-other",
        )

        assert len(client.get("/inventory/sds/?manufacturer=Acme").data) == 1
        assert len(client.get("/inventory/sds/?product_num=P-1").data) == 1
        assert len(client.get("/inventory/sds/?manufacturer=Other").data) == 1

    def test_revision_date_and_number_filters(self, sds, make_container):
        # Used by the frontend's pre-submit duplicate check — same chemical
        # + exact revision date + # already on file, independent of
        # manufacturer/product # text (which is how a typo like "Fisher
        # Chemical" vs "Thermo Fisher Chemical" still gets caught).
        client = APIClient()
        SDS.objects.create(
            container=make_container("other"),
            file_name="other.pdf",
            drive_id="drive-other",
            revision_date=date(2024, 6, 1),
            revision_number=9,
        )

        assert len(client.get("/inventory/sds/?revision_date=2024-01-01").data) == 1
        assert len(client.get("/inventory/sds/?revision_number=2").data) == 1
        assert (
            len(client.get("/inventory/sds/?revision_date=2024-01-01&revision_number=2").data) == 1
        )
        assert len(client.get("/inventory/sds/?revision_number=9").data) == 1


@pytest.mark.django_db
class TestSDSWriteSerializerCreatePaths:
    @patch("apps.inventory.serializers.chemicals.upload_sds_file")
    def test_file_path_uploads_to_drive(self, mock_upload, client_as, make_container):
        mock_upload.return_value = "drive-new"
        client = client_as(User.Role.STOCKROOM)
        container = make_container("c1", manufacturer="Acme", product_num="P-1")

        response = client.post(
            "/inventory/sds/",
            {
                "container": container.id,
                "file": make_pdf("original-name-discarded.pdf"),
                "revision_number": 3,
                "revision_date": "2024-06-01",
            },
        )

        assert response.status_code == 201
        # The original uploaded filename is discarded in favor of a generated,
        # human-navigable one — same name used for both the Drive file and
        # the stored row, so browsing Drive directly matches the app.
        expected_name = "Acme_P-1_Water_Rev3_2024-06-01.pdf"
        mock_upload.assert_called_once_with(ANY, expected_name)
        created = SDS.objects.get(id=response.data["id"])
        assert created.drive_id == "drive-new"
        assert created.file_name == expected_name

    @patch("apps.inventory.serializers.chemicals.upload_sds_file")
    def test_filename_falls_back_when_manufacturer_product_num_or_revision_missing(
        self, mock_upload, client_as, make_container
    ):
        mock_upload.return_value = "drive-new"
        client = client_as(User.Role.STOCKROOM)
        container = make_container("c1")  # no manufacturer/product_num, no revision info

        response = client.post("/inventory/sds/", {"container": container.id, "file": make_pdf()})

        assert response.status_code == 201
        assert SDS.objects.get(id=response.data["id"]).file_name == "Unknown_NA_Water.pdf"

    @patch("apps.inventory.serializers.chemicals.upload_sds_file")
    def test_existing_sds_path_reuses_the_drive_file_without_uploading(
        self, mock_upload, client_as, make_container, sds
    ):
        client = client_as(User.Role.STOCKROOM)
        other_container = make_container("c2", manufacturer="Acme", product_num="P-1")

        response = client.post(
            "/inventory/sds/",
            {"container": other_container.id, "existing_sds": sds.id},
            format="json",
        )

        assert response.status_code == 201
        mock_upload.assert_not_called()
        created = SDS.objects.get(id=response.data["id"])
        assert created.drive_id == sds.drive_id
        assert created.file_name == sds.file_name
        assert created.container_id == other_container.id
        # Metadata falls back to the source row's when not provided.
        assert created.revision_date == sds.revision_date
        assert created.revision_number == sds.revision_number

    def test_requires_exactly_one_of_file_or_existing_sds(self, client_as, make_container, sds):
        client = client_as(User.Role.STOCKROOM)
        container = make_container("c2")

        neither = client.post("/inventory/sds/", {"container": container.id}, format="json")
        both = client.post(
            "/inventory/sds/",
            {"container": container.id, "existing_sds": sds.id, "file": make_pdf()},
        )

        assert neither.status_code == 400
        assert both.status_code == 400


@pytest.mark.django_db
class TestChemicalAndContainerSdsAggregation:
    # Container/Chemical reads need at least an authenticated role (unlike
    # SDSView itself) — Lab Assistant, the lowest, is enough to prove these
    # fields work for anyone who can reach the page.
    def test_chemical_sds_list_spans_every_container(self, client_as, chemical, make_container):
        c1 = make_container("c1")
        c2 = make_container("c2")
        SDS.objects.create(container=c1, file_name="c1.pdf", drive_id="d1")
        SDS.objects.create(container=c2, file_name="c2.pdf", drive_id="d2")

        client = client_as(User.Role.LAB_ASSISTANT)
        response = client.get(f"/inventory/chemicals/{chemical.id}/")

        assert response.status_code == 200
        assert {row["file_name"] for row in response.data["sds"]} == {"c1.pdf", "c2.pdf"}

    def test_container_latest_sds_picks_the_newest_revision(self, client_as, make_container):
        container = make_container("c1")
        SDS.objects.create(
            container=container, file_name="old.pdf", drive_id="d-old", revision_number=1
        )
        SDS.objects.create(
            container=container, file_name="new.pdf", drive_id="d-new", revision_number=2
        )

        client = client_as(User.Role.LAB_ASSISTANT)
        response = client.get(f"/inventory/containers/{container.slug}/")

        assert response.status_code == 200
        assert response.data["latest_sds"]["file_name"] == "new.pdf"

    def test_container_with_no_sds_has_no_latest_sds(self, client_as, make_container):
        container = make_container("c1")

        client = client_as(User.Role.LAB_ASSISTANT)
        response = client.get(f"/inventory/containers/{container.slug}/")

        assert response.data["latest_sds"] is None

    def test_container_exposes_its_chemical_id(self, client_as, chemical, make_container):
        # Needed by the frontend's fallback lookup (a container with no SDS
        # of its own falls back to ?chemical=<id> for the chemical's other
        # SDS) — regression coverage for that id actually being on the wire.
        container = make_container("c1")

        client = client_as(User.Role.LAB_ASSISTANT)
        response = client.get(f"/inventory/containers/{container.slug}/")

        assert response.data["chemical"] == chemical.id
