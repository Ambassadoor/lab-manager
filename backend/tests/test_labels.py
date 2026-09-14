import pytest
from django.db import IntegrityError

from apps.inventory.models import LabelTemplate, LabelTemplateField
from apps.users.models import User


@pytest.fixture
def make_label_template(db):
    def _make(kind="container", template_number=1, media_width_mm=12, **overrides):
        defaults = {
            "name": f"{kind} label ({media_width_mm}mm)",
            "kind": kind,
            "template_number": template_number,
            "media_width_mm": media_width_mm,
        }
        defaults.update(overrides)
        return LabelTemplate.objects.create(**defaults)

    return _make


@pytest.mark.django_db
class TestLabelTemplateModel:
    def test_str_includes_name_number_and_width(self, make_label_template):
        template = make_label_template(name="Location label", template_number=3, media_width_mm=24)
        assert str(template) == "Location label (#3, 24mm)"

    def test_rejects_duplicate_kind_and_media_width(self, make_label_template):
        make_label_template(kind="location", media_width_mm=12, template_number=1)
        with pytest.raises(IntegrityError):
            make_label_template(kind="location", media_width_mm=12, template_number=2)

    def test_allows_same_media_width_for_different_kinds(self, make_label_template):
        # The unique constraint is (kind, media_width_mm) together, not
        # media_width_mm alone — two different label kinds can both use
        # 12mm tape, just not two rows for the *same* kind.
        make_label_template(kind="container", media_width_mm=12, template_number=1)
        make_label_template(kind="location", media_width_mm=12, template_number=2)

    def test_rejects_duplicate_template_number(self, make_label_template):
        # template_number is a physical printer slot — two DB rows can't
        # point at the same one regardless of kind/width.
        make_label_template(kind="container", media_width_mm=12, template_number=5)
        with pytest.raises(IntegrityError):
            make_label_template(kind="location", media_width_mm=24, template_number=5)

    def test_field_rejects_duplicate_role_on_same_template(self, make_label_template):
        template = make_label_template()
        LabelTemplateField.objects.create(template=template, role="barcode", object_name="Barcode1")
        with pytest.raises(IntegrityError):
            LabelTemplateField.objects.create(
                template=template, role="barcode", object_name="Barcode2"
            )


@pytest.mark.django_db
class TestLabelTemplatePermissions:
    def test_any_authenticated_role_can_read(self, client_as, make_label_template):
        make_label_template()
        client = client_as(User.Role.LAB_ASSISTANT)

        assert client.get("/inventory/label_templates/").status_code == 200

    @pytest.mark.parametrize(
        "role", [User.Role.LAB_ASSISTANT, User.Role.STOCKROOM, User.Role.COORDINATOR]
    )
    def test_below_lab_manager_cannot_write(self, client_as, make_label_template, role):
        template = make_label_template()
        client = client_as(role)
        payload = {
            "name": "New",
            "kind": "container",
            "template_number": 50,
            "media_width_mm": 12,
            "fields": [],
        }

        assert client.post("/inventory/label_templates/", payload, format="json").status_code == 403
        assert (
            client.patch(
                f"/inventory/label_templates/{template.id}/", {"name": "x"}, format="json"
            ).status_code
            == 403
        )
        assert client.delete(f"/inventory/label_templates/{template.id}/").status_code == 403

    @pytest.mark.parametrize("role", [User.Role.LAB_MANAGER, User.Role.ADMIN])
    def test_lab_manager_and_admin_can_write(self, client_as, make_label_template, role):
        client = client_as(role)
        payload = {
            "name": "Container label (12mm)",
            "kind": "container",
            "template_number": 1,
            "media_width_mm": 12,
            "fields": [
                {"role": "barcode", "object_name": "Barcode1"},
                {"role": "text", "object_name": "Text1"},
            ],
        }

        response = client.post("/inventory/label_templates/", payload, format="json")
        assert response.status_code == 201
        assert len(response.data["fields"]) == 2

        template_id = response.data["id"]
        assert (
            client.patch(
                f"/inventory/label_templates/{template_id}/", {"name": "Renamed"}, format="json"
            ).status_code
            == 200
        )
        assert client.delete(f"/inventory/label_templates/{template_id}/").status_code == 204


@pytest.mark.django_db
class TestLabelTemplateSerializer:
    def test_create_rejects_duplicate_role_in_fields(self, client_as):
        client = client_as(User.Role.LAB_MANAGER)
        payload = {
            "name": "Bad template",
            "kind": "container",
            "template_number": 1,
            "media_width_mm": 12,
            "fields": [
                {"role": "barcode", "object_name": "Barcode1"},
                {"role": "barcode", "object_name": "Barcode2"},
            ],
        }

        response = client.post("/inventory/label_templates/", payload, format="json")

        assert response.status_code == 400
        assert "fields" in response.data

    def test_update_replaces_fields_entirely(self, client_as, make_label_template):
        template = make_label_template()
        LabelTemplateField.objects.create(
            template=template, role="barcode", object_name="OldBarcode"
        )
        client = client_as(User.Role.LAB_MANAGER)

        response = client.put(
            f"/inventory/label_templates/{template.id}/",
            {
                "name": template.name,
                "kind": template.kind,
                "template_number": template.template_number,
                "media_width_mm": template.media_width_mm,
                "fields": [{"role": "text", "object_name": "NewText"}],
            },
            format="json",
        )

        assert response.status_code == 200
        roles = {f["role"] for f in response.data["fields"]}
        assert roles == {"text"}

    def test_filters_by_kind(self, client_as, make_label_template):
        make_label_template(kind="container", media_width_mm=12, template_number=1)
        make_label_template(kind="location", media_width_mm=12, template_number=2)
        client = client_as(User.Role.LAB_ASSISTANT)

        response = client.get("/inventory/label_templates/?kind=location")

        assert response.status_code == 200
        assert [t["kind"] for t in response.data] == ["location"]
