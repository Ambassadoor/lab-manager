import re

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from django.db import transaction

from ..drive import (
    DriveUploadError,
    rename_file,
    replace_file_content,
    trash_file,
    upload_sds_file,
)
from ..models import (
    SDS,
    Chemical,
    ChemicalStorageCategories,
    Container,
    Ingredient,
    highest_container_pk_subquery,
)

MAX_SDS_FILE_SIZE = 25 * 1024 * 1024  # 25MB


def _slugify_filename_part(value: str) -> str:
    value = re.sub(r"[^\w\- ]", "", value).strip()
    return re.sub(r"\s+", "-", value)


# Manufacturer_ProductNum_ChemicalName_RevN_Date.pdf (parts omitted where
# unavailable) — used as both the Drive filename and the stored SDS.file_name,
# so what someone sees browsing the Drive folder directly always matches what
# the app shows. The original uploaded filename is discarded entirely; for an
# internal lab tool, findability wins over keeping someone's own filename.
def _build_sds_filename(container, revision_date, revision_number) -> str:
    parts = [
        _slugify_filename_part(container.manufacturer or "Unknown"),
        _slugify_filename_part(container.product_num or "NA"),
        _slugify_filename_part(container.chemical.name),
    ]
    # Truthiness, not `is not None`: a blank revision number would name the
    # file "..._Rev.pdf"
    if revision_number:
        parts.append(f"Rev{revision_number}")
    if revision_date is not None:
        parts.append(str(revision_date))
    return "_".join(parts) + ".pdf"


class SDSContainerSerializer(serializers.ModelSerializer):
    label = serializers.ReadOnlyField()

    class Meta:
        model = Container
        fields = ["id", "label", "name"]


class SDSSerializer(serializers.ModelSerializer):
    container = SDSContainerSerializer(read_only=True)
    view_url = serializers.SerializerMethodField()

    class Meta:
        model = SDS
        fields = [
            "id",
            "container",
            "file_name",
            "drive_id",
            "revision_date",
            "revision_number",
            "ghs_pictograms",
            "view_url",
        ]

    # Drive's inline-preview endpoint — the frontend never builds this itself.
    def get_view_url(self, obj) -> str:
        return f"https://drive.google.com/file/d/{obj.drive_id}/preview"


def _chemical_sds_queryset():
    # Newest first across all of a chemical's containers. highest_pk is
    # copied onto each SDS's container (see _with_label_width) so the nested
    # container label costs no query of its own.
    return (
        SDS.objects.select_related("container")
        .annotate(container_highest_pk=highest_container_pk_subquery())
        .order_by(*SDS.NEWEST_FIRST)
    )


def _with_label_width(sds_rows):
    for sds in sds_rows:
        sds.container.highest_pk = sds.container_highest_pk
    return sds_rows


class ChemicalListSerializer(serializers.ListSerializer):
    """Loads the SDS for every chemical in the list in one query.

    Without this, ChemicalSerializer.get_sds runs once per chemical
    (finding 5 in docs/Post-MVP-Code-Review.md). The rows are grouped in the
    order the database returned them, not re-sorted in Python, so each
    chemical's list matches get_sds' own query exactly.
    """

    def to_representation(self, data):
        chemicals = list(data.all() if hasattr(data, "all") else data)
        sds_by_chemical = {}
        sds_rows = _chemical_sds_queryset().filter(
            container__chemical_id__in=[chemical.id for chemical in chemicals]
        )
        for sds in _with_label_width(sds_rows):
            sds_by_chemical.setdefault(sds.container.chemical_id, []).append(sds)
        self.child.sds_by_chemical = sds_by_chemical
        return super().to_representation(chemicals)


class ChemicalSerializer(serializers.ModelSerializer):
    sds = serializers.SerializerMethodField()

    class Meta:
        model = Chemical
        exclude = ["pubchem_cid", "synonyms"]
        depth = 1
        list_serializer_class = ChemicalListSerializer

    # Handles the self-reference
    def to_representation(self, instance):
        self.fields["ingredients"] = IngredientSerializer(many=True, read_only=True)
        return super().to_representation(instance)

    # Every SDS on file for this chemical, aggregated across all of its
    # containers — an SDS is tied to a Container (see SDS's docstring in
    # models/containers.py), not the chemical directly, so this is a lookup
    # rather than a plain reverse accessor.
    #
    # In a list, ChemicalListSerializer has already loaded them all.
    @extend_schema_field(SDSSerializer(many=True))
    def get_sds(self, obj):
        sds_by_chemical = getattr(self, "sds_by_chemical", None)
        if sds_by_chemical is not None:
            sds = sds_by_chemical.get(obj.id, [])
        else:
            sds = _with_label_width(_chemical_sds_queryset().filter(container__chemical=obj))
        return SDSSerializer(sds, many=True).data


# Create and edit. ChemicalSerializer can't be used for writes: its
# depth = 1 turns storage_category into a read-only nested object, so DRF
# silently drops a new category from a PATCH (issue #94).
class ChemicalWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Chemical
        fields = ["name", "cas", "formula", "molecular_weight", "storage_category"]

    # Respond with the full chemical, including its id (issue #113: the
    # Add Chemical page navigates to the new chemical by that id).
    def to_representation(self, instance):
        return ChemicalSerializer(instance, context=self.context).data


class ChemicalStorageCategoriesSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChemicalStorageCategories
        fields = "__all__"


class SDSWriteSerializer(serializers.ModelSerializer):
    container = serializers.PrimaryKeyRelatedField(queryset=Container.objects.all())
    # Exactly one of these two is required (see validate()): `file` uploads a
    # new document to Drive, `existing_sds` attaches a document already on
    # file to this container instead of duplicating it there.
    file = serializers.FileField(write_only=True, required=False)
    existing_sds = serializers.PrimaryKeyRelatedField(
        queryset=SDS.objects.all(), write_only=True, required=False
    )

    class Meta:
        model = SDS
        # "id" is read-only (an AutoField) — included so the create response
        # actually identifies the new row, e.g. to link straight to it.
        fields = [
            "id",
            "container",
            "file",
            "existing_sds",
            "revision_date",
            "revision_number",
            "ghs_pictograms",
        ]

    def validate_file(self, value):
        if not value.name.lower().endswith(".pdf"):
            raise serializers.ValidationError("SDS files must be PDFs.")
        if value.size > MAX_SDS_FILE_SIZE:
            raise serializers.ValidationError("File too large (25MB max).")
        return value

    def validate(self, attrs):
        if bool(attrs.get("file")) == bool(attrs.get("existing_sds")):
            raise serializers.ValidationError(
                "Provide exactly one of `file` (upload a new document) or "
                "`existing_sds` (attach a document already on file)."
            )
        return attrs

    def create(self, validated_data):
        container = validated_data["container"]
        return SDS.objects.create(
            container=container, **_resolve_document(validated_data, container)
        )


# The document fields of an SDS row being attached to `container`: a new
# upload (`file`, named and sent to Drive here), or a document already on
# file (`existing_sds`), whose Drive file is reused rather than copied —
# each row is still its own revision-history entry for its container. Given
# revision fields win; for an existing document, missing ones come from it.
def _resolve_document(validated_data, container) -> dict:
    file = validated_data.get("file")
    existing_sds = validated_data.get("existing_sds")
    pictograms = validated_data.get("ghs_pictograms") or []

    if file is not None:
        revision_date = validated_data.get("revision_date")
        revision_number = validated_data.get("revision_number")
        file_name = _build_sds_filename(container, revision_date, revision_number)
        try:
            drive_id = upload_sds_file(file, file_name)
        except DriveUploadError as e:
            raise serializers.ValidationError({"file": str(e)}) from e
        return {
            "drive_id": drive_id,
            "file_name": file_name,
            "revision_date": revision_date,
            "revision_number": revision_number,
            "ghs_pictograms": pictograms,
        }

    return {
        "drive_id": existing_sds.drive_id,
        "file_name": existing_sds.file_name,
        "revision_date": validated_data.get("revision_date", existing_sds.revision_date),
        "revision_number": validated_data.get("revision_number", existing_sds.revision_number),
        "ghs_pictograms": pictograms or existing_sds.ghs_pictograms,
    }


# "Wrong SDS on this container": points one SDS row at a different document
# (one already on file, or a new upload) without touching the other
# containers that shared the old one. The old Drive file is trashed only if
# no row uses it any more.
class SDSReplaceSerializer(SDSWriteSerializer):
    container = None

    class Meta(SDSWriteSerializer.Meta):
        fields = ["file", "existing_sds", "revision_date", "revision_number", "ghs_pictograms"]

    def update(self, instance, validated_data):
        old_drive_id = instance.drive_id
        for field, value in _resolve_document(validated_data, instance.container).items():
            setattr(instance, field, value)
        instance.save()
        if not SDS.objects.filter(drive_id=old_drive_id).exists():
            try:
                trash_file(old_drive_id)
            except DriveUploadError:
                # A leftover file in the Drive folder is harmless; the
                # correction itself has already been saved
                pass
        return instance


# "Fix this document": corrects an SDS's revision date/number and pictograms,
# and optionally swaps in the right PDF, for every SDS row that shares its
# Drive file (they are the same document, attached to several containers).
# The file is renamed to match on Drive, and replaced in place if a new PDF
# is given, so its link doesn't change.
class SDSCorrectionSerializer(serializers.ModelSerializer):
    file = serializers.FileField(write_only=True, required=False)

    class Meta:
        model = SDS
        fields = ["revision_date", "revision_number", "ghs_pictograms", "file"]

    validate_file = SDSWriteSerializer.validate_file

    def update(self, instance, validated_data):
        file = validated_data.pop("file", None)
        revision_date = validated_data.get("revision_date", instance.revision_date)
        revision_number = validated_data.get("revision_number", instance.revision_number)
        file_name = _build_sds_filename(instance.container, revision_date, revision_number)

        # Drive first: if it fails, nothing in the database has changed
        try:
            if file is not None:
                replace_file_content(instance.drive_id, file, file_name)
            elif file_name != instance.file_name:
                rename_file(instance.drive_id, file_name)
        except DriveUploadError as e:
            raise serializers.ValidationError({"file" if file else "detail": str(e)}) from e

        # Saved one at a time rather than with .update(), so each row's
        # updated_at (and change history) is recorded; a document is only
        # ever shared by a handful of rows.
        with transaction.atomic():
            for sds in SDS.objects.filter(drive_id=instance.drive_id):
                sds.file_name = file_name
                for field, value in validated_data.items():
                    setattr(sds, field, value)
                sds.save()
        instance.refresh_from_db()
        return instance


class IngredientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ingredient
        fields = ["mixture", "ingredient"]
