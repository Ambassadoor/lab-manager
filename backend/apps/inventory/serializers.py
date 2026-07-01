from rest_framework import serializers
from .models import (
    ChemicalStorageCategories,
    Chemical,
    SDS,
    Location,
    Container,
    WeightReading,
    CheckoutEvent,
    Ingredient,
)

from decimal import Decimal
from decimal import DecimalException


class ChemicalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Chemical
        exclude = ["pubchem_cid", "synonyms"]
        depth = 1

    def to_representation(self, instance):
        self.fields["ingredients"] = IngredientSerializer(many=True, read_only=True)
        return super().to_representation(instance)


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
        fields = ["id", "name", "type", "parent", "full_path"]

    def to_representation(self, instance):
        self.fields["parent"] = LocationSerializer(many=False, read_only=True)
        return super().to_representation(instance)


class ContainerSerializer(serializers.ModelSerializer):
    label = serializers.ReadOnlyField(label="ID")
    is_opened = serializers.ReadOnlyField(label="Opened?")
    quantity = serializers.ReadOnlyField(label="Quantity")
    location = serializers.ReadOnlyField(label="Location", source="location.full_path")
    percent_remaining = serializers.SerializerMethodField()
    latest_reading = serializers.SerializerMethodField()

    class Meta:
        model = Container
        fields = [
            "id",
            "label",
            "slug",
            "name",
            "density",
            "location",
            "manufacturer",
            "quantity",
            "initial_quantity",
            "quantity_unit",
            "product_num",
            "date_received",
            "is_opened",
            "latest_reading",
            "percent_remaining",
        ]

    def get_latest_reading(self, obj):
        latest = obj.readings.order_by("-recorded_at").first()
        if latest:
            return WeightReadingSerializer(latest).data

    def get_percent_remaining(self, obj):
        try:
            if obj.initial_content_mass is not None:
                mass = Decimal(str(obj.initial_content_mass))
            else:
                return None
            latest_reading = self.get_latest_reading(obj)
            if latest_reading is not None:
                current_weight = Decimal(str(latest_reading["weight"]))
            else:
                return None
            if obj.tare_weight is not None:
                tare_weight = Decimal(str(obj.tare_weight))
            else:
                return None

            return ((current_weight - tare_weight) / mass) * 100
        except DecimalException:
            return None


class ContainerWriteSerializer(serializers.ModelSerializer):
    initial_quantity = serializers.IntegerField(min_value=0)
    chemical = serializers.PrimaryKeyRelatedField(queryset=Chemical.objects.all())
    location = serializers.PrimaryKeyRelatedField(queryset=Location.objects.all())

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
    user = serializers.HiddenField(default=serializers.CurrentUserDefault())

    class Meta:
        model = CheckoutEvent
        exclude = ["container"]


class CheckoutEventWriteSerializer(serializers.ModelSerializer):
    user = serializers.HiddenField(default=serializers.CurrentUserDefault())

    class Meta:
        model = CheckoutEvent
        fields = "__all__"


class IngredientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ingredient
        ingredient = ChemicalSerializer(read_only=True)
        fields = ["ingredient"]
        depth = 1
