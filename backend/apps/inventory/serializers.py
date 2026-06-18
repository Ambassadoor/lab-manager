from rest_framework import serializers
from .models import (
    ChemicalStorageCategories,
    Chemical,
    SDS,
    Location,
    Container,
    WeightReading,
    CheckoutEvent,
)


class ChemicalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Chemical
        exclude = ["pubchem_cid", "synonyms"]


class ChemicalStorageCategoriesSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChemicalStorageCategories
        fields = "__all__"


class SDSSerializer(serializers.ModelSerializer):
    class Meta:
        model = SDS
        fields = ["file_name", "revision_date", "revision_number"]


class LocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = ["id", "name", "type", "parent"]

    def to_representation(self, instance):
        self.fields["parent"] = LocationSerializer(many=False, read_only=True)
        return super().to_representation(instance)


class ContainerSerializer(serializers.ModelSerializer):
    label = serializers.ReadOnlyField(label="ID")
    is_opened = serializers.ReadOnlyField(label="Opened?")
    quantity = serializers.ReadOnlyField(label="Quantity")
    location = serializers.ReadOnlyField(label="Location", source="location.full_path")

    class Meta:
        model = Container
        fields = [
            "label",
            "name",
            "location",
            "manufacturer",
            "quantity",
            "product_num",
            "is_opened",
        ]


class ContainerWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Container
        fields = [
            "name",
            "chemical",
            "location",
            "manufacturer",
            "initial_quantity",
            "quantity_unit",
            "product_num",
            "date_received",
            "density",
            "expiration_date",
            "initial_weight",
            "tare_weight",
        ]


class WeightReadingSerializer(serializers.ModelSerializer):
    class Meta:
        model = WeightReading
        fields = ["id", "weight", "recorded_at"]


class CheckoutEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = CheckoutEvent
        exclude = ["container"]
