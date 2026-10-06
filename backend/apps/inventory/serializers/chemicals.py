import re

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from ..drive import DriveUploadError, upload_sds_file
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
    if revision_number is not None:
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
        file = validated_data.pop("file", None)
        existing_sds = validated_data.pop("existing_sds", None)
        container = validated_data["container"]

        if file is not None:
            filename = _build_sds_filename(
                container,
                validated_data.get("revision_date"),
                validated_data.get("revision_number"),
            )
            try:
                drive_id = upload_sds_file(file, filename)
            except DriveUploadError as e:
                raise serializers.ValidationError({"file": str(e)}) from e
            validated_data["drive_id"] = drive_id
            validated_data["file_name"] = filename
        else:
            # Reuse the existing document's Drive file rather than uploading
            # a duplicate copy — this row is still its own revision-history
            # entry for `container`, just pointing at the same file.
            validated_data["drive_id"] = existing_sds.drive_id
            validated_data["file_name"] = existing_sds.file_name
            validated_data.setdefault("revision_date", existing_sds.revision_date)
            validated_data.setdefault("revision_number", existing_sds.revision_number)
            if not validated_data.get("ghs_pictograms"):
                validated_data["ghs_pictograms"] = existing_sds.ghs_pictograms

        return SDS.objects.create(**validated_data)


class IngredientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ingredient
        fields = ["mixture", "ingredient"]
