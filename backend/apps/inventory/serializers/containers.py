from decimal import Decimal, DecimalException, ROUND_HALF_UP

from rest_framework import serializers

from apps.users.serializers import UserCheckoutEventSerializer

from ..models import Chemical, CheckoutEvent, Container, Location, WeightReading
from .locations import LocationSerializer, LocationTypeSerializer


class ContainerSerializer(serializers.ModelSerializer):
    label = serializers.ReadOnlyField(label="ID")
    is_opened = serializers.ReadOnlyField(label="Opened?")
    quantity = serializers.ReadOnlyField(label="Quantity")
    has_estimated_usage = serializers.ReadOnlyField(label="Has Estimated Usage?")
    location = LocationSerializer()
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
            "has_estimated_usage",
            "latest_reading",
            "percent_remaining",
            "checkout_status",
        ]

    # Returns the most recent weight reading
    def get_latest_reading(self, obj):
        latest = obj.readings.order_by("-recorded_at").first()
        if latest:
            return WeightReadingSerializer(latest).data

    # Calculates the percentage remaining using the most recent reading
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
            # Matches Container.has_estimated_usage: a non-positive
            # tare_weight isn't a real measurement (see migration
            # 0026_null_placeholder_zero_tare_weights).
            if obj.tare_weight is not None and obj.tare_weight > 0:
                tare_weight = Decimal(str(obj.tare_weight))
            else:
                return None

            percent_remaining = ((current_weight - tare_weight) / mass) * 100
            return percent_remaining.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        except DecimalException:
            return None

    # Returns the current checkout status ("in/out")
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


# Serializer for weight reading writes
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


# Lives here rather than serializers/locations.py: it needs ContainerSerializer
# (defined above), and ContainerSerializer needs LocationSerializer — keeping
# both directions of that dependency in one file avoids a locations <-> containers
# circular import between the two modules.
class LocationContainersSerializer(serializers.ModelSerializer):
    containers = serializers.SerializerMethodField()
    type = LocationTypeSerializer(many=False)

    class Meta:
        model = Location
        fields = ["id", "name", "type", "full_path", "containers"]

    # Get's all containers for selected location and any of it's children locations
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
