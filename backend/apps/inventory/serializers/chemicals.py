from rest_framework import serializers

from ..drive import DriveUploadError, upload_sds_file
from ..models import Chemical, ChemicalStorageCategories, Container, Ingredient, SDS

MAX_SDS_FILE_SIZE = 25 * 1024 * 1024  # 25MB


class ChemicalSerializer(serializers.ModelSerializer):
    sds = serializers.SerializerMethodField()

    class Meta:
        model = Chemical
        exclude = ["pubchem_cid", "synonyms"]
        depth = 1

    # Handles the self-reference
    def to_representation(self, instance):
        self.fields["ingredients"] = IngredientSerializer(many=True, read_only=True)
        return super().to_representation(instance)

    # Every SDS on file for this chemical, aggregated across all of its
    # containers — an SDS is tied to a Container (see SDS's docstring in
    # models/containers.py), not the chemical directly, so this is a lookup
    # rather than a plain reverse accessor.
    def get_sds(self, obj):
        sds = (
            SDS.objects.filter(container__chemical=obj)
            .select_related("container")
            .order_by("-revision_date", "-revision_number")
        )
        return SDSSerializer(sds, many=True).data


class ChemicalWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Chemical
        fields = ["name", "cas", "formula", "molecular_weight", "storage_category"]


class ChemicalStorageCategoriesSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChemicalStorageCategories
        fields = "__all__"


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
    def get_view_url(self, obj):
        return f"https://drive.google.com/file/d/{obj.drive_id}/preview"


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

        if file is not None:
            try:
                drive_id = upload_sds_file(file, file.name)
            except DriveUploadError as e:
                raise serializers.ValidationError({"file": str(e)}) from e
            validated_data["drive_id"] = drive_id
            validated_data["file_name"] = file.name
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
