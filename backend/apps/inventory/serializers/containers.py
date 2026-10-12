from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.users.serializers import UserCheckoutEventSerializer

from ..models import (
    Chemical,
    CheckoutEvent,
    Container,
    Location,
    WeightReading,
    descendant_location_ids,
)
from ..storage_rules import check_storage_conflicts
from .chemicals import SDSSerializer
from .locations import LocationSerializer, LocationTypeSerializer


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
    # Who has it: the holder, the name given, or (older events) the recorder
    holder_display = serializers.ReadOnlyField()

    class Meta:
        model = CheckoutEvent
        # The holder's Lipscomb ID is kept for linking them up later, but not
        # shown: checkout status is visible to every logged-in user
        exclude = ["container", "holder_lipscomb_id"]


class CheckoutEventWriteSerializer(serializers.ModelSerializer):
    user = serializers.HiddenField(default=serializers.CurrentUserDefault())

    class Meta:
        model = CheckoutEvent
        fields = "__all__"


class ContainerSerializer(serializers.ModelSerializer):
    label = serializers.ReadOnlyField(label="ID")
    is_opened = serializers.ReadOnlyField(label="Opened?")
    quantity = serializers.ReadOnlyField(label="Quantity")
    has_estimated_usage = serializers.ReadOnlyField(label="Has Estimated Usage?")
    location = LocationSerializer()
    # Read-only PK, not nested — the frontend only needs the id, to fall
    # back to the chemical's other SDS when this container has none of its
    # own (see useContainerSdsFallback.ts). Writes still go through
    # ContainerWriteSerializer, unaffected by this being read-only here.
    chemical = serializers.PrimaryKeyRelatedField(read_only=True)
    percent_remaining = serializers.SerializerMethodField()
    latest_reading = serializers.SerializerMethodField()
    checkout_status = serializers.SerializerMethodField()
    latest_sds = serializers.SerializerMethodField()
    # Set through ContainerView.discard/restore only, never a plain update
    date_discarded = serializers.DateField(read_only=True, allow_null=True)
    discarded_by = UserCheckoutEventSerializer(read_only=True, allow_null=True)

    class Meta:
        model = Container
        fields = [
            "id",
            "label",
            "slug",
            "name",
            "chemical",
            "density",
            "location",
            "manufacturer",
            "quantity",
            "initial_quantity",
            "quantity_unit",
            "product_num",
            "date_received",
            "is_opened",
            "tare_weight",
            "has_estimated_usage",
            "latest_reading",
            "percent_remaining",
            "checkout_status",
            "latest_sds",
            "date_discarded",
            "discarded_by",
        ]

    # The get_* methods below read rows that Container.objects.for_display()
    # prefetches for a whole list; on a container fetched without it, each
    # falls back to one query (see Container.latest_reading and friends).

    # Returns the most recent weight reading
    @extend_schema_field(WeightReadingSerializer(allow_null=True))
    def get_latest_reading(self, obj):
        latest = obj.latest_reading()
        if latest:
            return WeightReadingSerializer(latest).data

    # Returns this container's own most recent SDS, if it has one — a
    # container with none should fall back to its chemical's other SDS
    # (see ChemicalSerializer.get_sds), which the frontend fetches
    # separately rather than this serializer guessing at a substitute.
    @extend_schema_field(SDSSerializer(allow_null=True))
    def get_latest_sds(self, obj):
        latest = obj.latest_sds()
        if latest:
            return SDSSerializer(latest).data

    # Delegates to Container.percent_remaining — the one place this is
    # computed, so DashboardView's restock_soon can use the exact same
    # logic instead of a second, independently-drifting implementation
    # (see that property's docstring for the bug this caused).
    # A Decimal, which the JSON renderer writes as a number
    @extend_schema_field(serializers.FloatField(allow_null=True))
    def get_percent_remaining(self, obj):
        return obj.percent_remaining

    # Returns the current checkout status ("in/out")
    @extend_schema_field(CheckoutEventSerializer(allow_null=True))
    def get_checkout_status(self, obj):
        latest = obj.latest_event()
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

    # Set by validate() below; read by the view afterward to decide whether
    # to 409 instead of saving. A property (not a plain attribute set in
    # __init__) so a serializer instance whose validate() never ran (or
    # ran and found nothing) still reads back an empty list rather than
    # raising AttributeError.
    @property
    def storage_warnings(self) -> list[str]:
        return getattr(self, "_storage_warnings", [])

    # Advisory, not a hard failure: doesn't raise, just records
    # storage_warnings for the view to act on. `location` is only in attrs
    # when this request actually sets/changes it (a PATCH that doesn't
    # touch location has nothing to check); re-saving the same location a
    # container is already in isn't a "move" and shouldn't warn about
    # conflicting with itself.
    def validate(self, attrs):
        self._storage_warnings = []
        location = attrs.get("location")
        if location is None:
            return attrs
        if self.instance is not None and self.instance.location_id == location.id:
            return attrs
        # Create always includes `chemical`; update/transfer never do (the
        # UI has no way to change a container's chemical after creation),
        # so it falls back to the instance's existing one.
        chemical = attrs.get("chemical") or (self.instance.chemical if self.instance else None)
        if chemical is not None:
            self._storage_warnings = check_storage_conflicts(
                chemical,
                location,
                exclude_container_id=self.instance.id if self.instance else None,
                # Set by transfer() for a batch's sibling containers being
                # placed in the same location in the same request — absent
                # (checks only against what's already there) everywhere else.
                also_placing=self.context.get("also_placing", ()),
            )
        return attrs


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

    # Every active container in this location or any location under it
    @extend_schema_field(ContainerSerializer(many=True))
    def get_containers(self, obj):
        location_ids = descendant_location_ids(obj.id)
        containers = Container.objects.active().for_display().filter(location__id__in=location_ids)
        serializer = ContainerSerializer(containers, many=True)
        return serializer.data
