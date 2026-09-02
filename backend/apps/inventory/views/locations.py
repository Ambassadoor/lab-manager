from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import ProtectedError
from django.db.models.functions import Lower
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from ..filters import LocationFilter
from ..models import Location, LocationTypes
from ..permissions import IsCoordinator, IsManager
from ..serializers import (
    LocationContainersSerializer,
    LocationMenuSerializer,
    LocationSerializer,
    LocationTypeSerializer,
    LocationWriteSerializer,
)


class LocationView(ModelViewSet):
    queryset = Location.objects.all()
    filterset_class = LocationFilter
    search_fields = ["name"]
    ordering_fields = ["name"]
    ordering = ["name"]

    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ["destroy"]:
            return [permission() for permission in [IsManager | IsCoordinator]]
        return super().get_permissions()

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.kwargs.get("pk"):
            return queryset
        if self.action == "menu":
            return queryset
        else:
            return queryset.filter(parent__exact=None).order_by("name")

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update", "add_child"]:
            return LocationWriteSerializer
        if self.action in ["menu"]:
            return LocationMenuSerializer
        else:
            return LocationSerializer

    # Handles creating new locations/location types
    @transaction.atomic
    def create(self, request):
        data = request.data
        if "new_type" in data and data.get("new_type") is not None:
            new_type = data.get("new_type")
            new_type["slug"] = new_type.get("name").strip().lower().replace(" ", "_")
            serializer = LocationTypeSerializer(data=new_type)
            serializer.is_valid(raise_exception=True)
            type = serializer.save()
            data["type"] = type.id
        location_data = {
            "name": data.get("name"),
            "parent": data.get("parent"),
            "type": data.get("type"),
        }
        location_serializer = LocationWriteSerializer(data=location_data)
        location_serializer.is_valid(raise_exception=True)
        location = location_serializer.save()
        location.barcode = f"LOC-{location.id}"
        location.save()
        return Response(LocationSerializer(location).data, status=status.HTTP_201_CREATED)

    # Returns the locations in a format easily usable in select menus
    @action(detail=False, methods=["GET"])
    def menu(self, request):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    # Adds a new child location
    @action(detail=True, methods=["POST"])
    @transaction.atomic
    def add_child(self, request, pk=None):
        data = request.data
        parent = self.get_object()

        data["parent"] = parent.id
        serializer = LocationWriteSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        location = serializer.save()
        location.barcode = f"LOC-{location.id}"
        location.save()

        response_serializer = LocationSerializer(location)

        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    # Bulk re-parents a set of locations under a new parent in one request —
    # mirrors Container.transfer, but pre-checks that the new parent isn't a
    # descendant of any location being moved (the same cycle Location.clean()
    # rejects) before touching the database, so a rejected move never
    # partially commits.
    @action(detail=False, methods=["PATCH"])
    def move(self, request):
        data = request.data
        # Barcodes encode "loc-<id>" and are stored as scanned — compare
        # case-insensitively so a scan's casing can't false-negative.
        child_slugs = [c["slug"].strip().lower() for c in data["childLocations"]]
        parent_slug = data["parentLocation"].strip().lower()

        locations = list(
            Location.objects.annotate(barcode_lower=Lower("barcode")).filter(
                barcode_lower__in=child_slugs
            )
        )
        missing = set(child_slugs) - {loc.barcode_lower for loc in locations}
        if missing:
            return Response(
                {"detail": f"Location(s) not found: {', '.join(sorted(missing))}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            parent = Location.objects.annotate(barcode_lower=Lower("barcode")).get(
                barcode_lower=parent_slug
            )
        except Location.DoesNotExist:
            return Response(
                {"detail": f"Parent location not found: {parent_slug}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Same ancestor walk as Location.clean(), run once up front against
        # the single target parent (rather than per-row inside the loop
        # below) so a cycle is caught before any row is saved.
        parent_chain_ids = set()
        ancestor = parent
        while ancestor is not None:
            parent_chain_ids.add(ancestor.id)
            ancestor = ancestor.parent

        conflicts = [loc for loc in locations if loc.id in parent_chain_ids]
        if conflicts:
            names = ", ".join(sorted(loc.barcode_lower for loc in conflicts))
            return Response(
                {
                    "detail": (
                        "Cannot move a location under itself or one of its own "
                        f"descendants: {names}"
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # Plain `with`, not the `@transaction.atomic` decorator: the
            # ValidationError is caught outside this block so Django still
            # rolls the block back before we respond, instead of committing
            # whatever rows saved before the failure.
            with transaction.atomic():
                for location in locations:
                    location.parent = parent
                    location.save()
        except DjangoValidationError as e:
            detail = e.message_dict if hasattr(e, "message_dict") else e.messages
            return Response({"detail": detail}, status=status.HTTP_400_BAD_REQUEST)

        return Response(LocationSerializer(locations, many=True).data, status=status.HTTP_200_OK)

    # Returns all containers for a given location, including nested child locations
    @action(detail=True, methods=["GET"])
    def containers(self, request, pk=None):
        location = self.get_object()

        serializer = LocationContainersSerializer(location)
        return Response(serializer.data, status=status.HTTP_200_OK)

    # Deletes a location or returns an error message if the selected location has any child locations or containers
    def destroy(self, request, pk=None):
        try:
            location = self.get_object()
            location.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except ProtectedError:
            return Response(
                {
                    "detail": "Cannot delete this location, there are children locations and/or containers that need to be moved first."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )


class LocationTypeView(ModelViewSet):
    queryset = LocationTypes.objects.all()
    serializer_class = LocationTypeSerializer

    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ["destroy"]:
            return [permission() for permission in [IsManager]]
        return super().get_permissions()
