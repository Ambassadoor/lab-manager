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
        # instance isn't always a root (LocationView.retrieve() can fetch any
        # location by pk) — its own full_path still needs one ancestor walk.
        # Every *descendant* below it, though, gets its full_path built by
        # appending one name to its parent's already-computed path (below in
        # _serialize) rather than re-walking from scratch, so this ancestor
        # walk happens at most once per request instead of once per node.
        instance_full_path = self._ancestor_full_path(by_id[instance.id], by_id)
        return self._serialize(instance.id, by_id, children_by_parent, instance_full_path)

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

    def _serialize(self, location_id, by_id, children_by_parent, full_path):
        location = by_id[location_id]
        return {
            "id": location.id,
            "name": location.name,
            "type": LocationTypeSerializer(location.type).data,
            "children": [
                self._serialize(child.id, by_id, children_by_parent, f"{full_path} {child.name}")
                for child in children_by_parent.get(location_id, [])
            ],
            "full_path": full_path,
        }

    def _ancestor_full_path(self, location, by_id):
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
        # A flat list has no natural top-down order to walk (unlike
        # LocationSerializer's tree recursion, where a parent's full_path is
        # always computed before its children's), so this memoizes each id's
        # path as it's computed instead — a location whose path was already
        # built while resolving a sibling's ancestor chain is reused rather
        # than re-walked, keeping the whole list's total work O(n).
        cache = self._full_path_cache()
        return self._full_path(obj.id, cache)

    def _full_path(self, location_id, cache):
        if location_id in cache:
            return cache[location_id]
        name, parent_id = self._parent_map()[location_id]
        path = name if parent_id is None else f"{self._full_path(parent_id, cache)} {name}"
        cache[location_id] = path
        return path

    def _full_path_cache(self):
        cache = getattr(self, "_cached_full_paths", None)
        if cache is None:
            cache = {}
            self._cached_full_paths = cache
        return cache

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
