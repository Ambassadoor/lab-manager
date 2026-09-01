from rest_framework import serializers

from ..models import Location, LocationTypes


class LocationTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LocationTypes
        fields = "__all__"


class LocationSerializer(serializers.ModelSerializer):
    type = LocationTypeSerializer()

    class Meta:
        model = Location
        fields = ["id", "name", "type", "children", "full_path"]

    # Handles the self reference
    def to_representation(self, instance):
        self.fields["children"] = LocationSerializer(many=True, read_only=True)
        return super().to_representation(instance)


class LocationWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = ["name", "type", "parent"]

    # Handles the self reference
    def to_representation(self, instance):
        self.fields["parent"] = LocationSerializer(many=False)
        return super().to_representation(instance)


class LocationMenuSerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = ["id", "name", "full_path"]


# LocationContainersSerializer (Location + its nested containers) is not here —
# it needs ContainerSerializer, and ContainerSerializer needs LocationSerializer,
# so it lives in serializers/containers.py to keep that dependency one-directional
# instead of circular. See the comment there.
