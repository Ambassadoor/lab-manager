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

    # Replaces a former self.fields["children"] = LocationSerializer(many=True,
    # ...) trick: that re-instantiated LocationSerializer at every tree level,
    # each instance independently re-querying full_path's ancestor chain, its
    # own children.all(), and its own un-select_related .type lookup — one
    # query per node visited, doubly so for full_path's own per-level walk.
    # Loading every location once (name-ordered — Location.Meta.ordering's
    # guarantee, made explicit here since the tree's child order depends on
    # it) and recursing over that in-memory map instead costs one query
    # total, cached on `self` so a many=True list (e.g. every root location)
    # only pays for it once, not once per root.
    def to_representation(self, instance):
        by_id, children_by_parent = self._location_map()
        return self._serialize(instance.id, by_id, children_by_parent)

    def _location_map(self):
        cached = getattr(self, "_cached_location_map", None)
        if cached is not None:
            return cached
        locations = list(Location.objects.select_related("type").order_by("name"))
        by_id = {loc.id: loc for loc in locations}
        children_by_parent: dict[int | None, list[Location]] = {}
        for loc in locations:
            children_by_parent.setdefault(loc.parent_id, []).append(loc)
        cached = (by_id, children_by_parent)
        self._cached_location_map = cached
        return cached

    def _serialize(self, location_id, by_id, children_by_parent):
        location = by_id[location_id]
        return {
            "id": location.id,
            "name": location.name,
            "type": LocationTypeSerializer(location.type).data,
            "children": [
                self._serialize(child.id, by_id, children_by_parent)
                for child in children_by_parent.get(location_id, [])
            ],
            "full_path": self._full_path(location, by_id),
        }

    def _full_path(self, location, by_id):
        names = []
        current = location
        while current is not None:
            names.append(current.name)
            current = by_id.get(current.parent_id)
        return " ".join(reversed(names))


class LocationWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = ["name", "type", "parent"]

    # Handles the self reference
    def to_representation(self, instance):
        self.fields["parent"] = LocationSerializer(many=False)
        return super().to_representation(instance)


class LocationMenuSerializer(serializers.ModelSerializer):
    # full_path here would otherwise fall back to Location.full_path, whose
    # per-instance ancestor walk costs one query per level *per location* —
    # this endpoint serializes every location in the system (it's the
    # dropdown source for Transfer/AddLocation/EditLocation), so that's the
    # worst-case call site for it. Loading every (id, name, parent_id) once
    # and walking the chain in memory instead costs one query total for the
    # whole list, cached on `self` the same way as LocationSerializer above.
    full_path = serializers.SerializerMethodField()

    class Meta:
        model = Location
        fields = ["id", "name", "full_path"]

    def get_full_path(self, obj):
        by_id = self._parent_map()
        names = []
        current_id = obj.id
        while current_id is not None:
            name, parent_id = by_id[current_id]
            names.append(name)
            current_id = parent_id
        return " ".join(reversed(names))

    def _parent_map(self):
        cached = getattr(self, "_cached_parent_map", None)
        if cached is not None:
            return cached
        by_id = {
            loc_id: (name, parent_id)
            for loc_id, name, parent_id in Location.objects.values_list("id", "name", "parent_id")
        }
        self._cached_parent_map = by_id
        return by_id


# LocationContainersSerializer (Location + its nested containers) is not here —
# it needs ContainerSerializer, and ContainerSerializer needs LocationSerializer,
# so it lives in serializers/containers.py to keep that dependency one-directional
# instead of circular. See the comment there.
