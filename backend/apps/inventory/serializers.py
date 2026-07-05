from rest_framework import serializers
from .models import (
    ChemicalStorageCategories,
    Chemical,
    SDS,
    Location,
    LocationTypes,
    Container,
    WeightReading,
    CheckoutEvent,
    Ingredient,
)

from apps.users.serializers import UserCheckoutEventSerializer

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


class ChemicalWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Chemical
        fields = ["name", "cas", "formula", "molecular_weight", "storage_category"]


class ChemicalStorageCategoriesSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChemicalStorageCategories
        fields = "__all__"


class SDSSerializer(serializers.ModelSerializer):
    class Meta:
        model = SDS
        fields = ["file_name", "revision_date", "revision_number"]


class LocationTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LocationTypes
        fields = "__all__"


class LocationSerializer(serializers.ModelSerializer):
    type = LocationTypeSerializer()

    class Meta:
        model = Location
        fields = ["id", "name", "type", "children", "full_path"]

    def to_representation(self, instance):
        self.fields["children"] = LocationSerializer(many=True, read_only=True)
        return super().to_representation(instance)


class LocationWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = ["name", "type", "parent"]

    def to_representation(self, instance):
        self.fields["parent"] = LocationSerializer(many=False)
        return super().to_representation(instance)


class LocationMenuSerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = ["id", "name", "full_path"]


class LocationContainersSerializer(serializers.ModelSerializer):
    containers = serializers.SerializerMethodField()
    type = LocationTypeSerializer(many=False)

    class Meta:
        model = Location
        fields = ["id", "name", "type", "full_path", "containers"]

    def get_containers(self, obj):
        def accumulate_ids(obj, ids=None):
            if ids is None:
                ids = []
            ids.append(obj.id)
            for child in obj.children.all():
                ids = accumulate_ids(child, ids)
            return ids

        location_ids = accumulate_ids(obj)
        containers = Container.objects.filter(location__id__in=location_ids)
        serializer = ContainerSerializer(containers, many=True)
        return serializer.data


class ContainerSerializer(serializers.ModelSerializer):
    label = serializers.ReadOnlyField(label="ID")
    is_opened = serializers.ReadOnlyField(label="Opened?")
    quantity = serializers.ReadOnlyField(label="Quantity")
    location = serializers.ReadOnlyField(label="Location", source="location.full_path")
    percent_remaining = serializers.SerializerMethodField()
    latest_reading = serializers.SerializerMethodField()
    checkout_status = serializers.SerializerMethodField()

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
            "checkout_status",
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

    def get_checkout_status(self, obj):
        latest = obj.events.order_by("-timestamp").first()
        if latest:
            return CheckoutEventSerializer(latest).data


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
    recorded_by = serializers.HiddenField(default=serializers.CurrentUserDefault())

    class Meta:
        model = WeightReading
        fields = ["id", "weight", "recorded_at", "recorded_by", "container"]


class WeightReadingReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = WeightReading
        fields = "__all__"


class CheckoutEventSerializer(serializers.ModelSerializer):
    user = UserCheckoutEventSerializer(read_only=True)

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
