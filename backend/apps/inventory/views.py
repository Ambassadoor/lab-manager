from rest_framework.viewsets import ModelViewSet
from rest_framework import filters, status
from rest_framework.decorators import action
from natsort import natsorted
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.http import Http404
from .models import (
    Container,
    Chemical,
    Location,
    LocationTypes,
    ChemicalStorageCategories,
    WeightReading,
)
from .serializers import (
    ContainerSerializer,
    ContainerWriteSerializer,
    ChemicalSerializer,
    CheckoutEventSerializer,
    ChemicalWriteSerializer,
    CheckoutEventWriteSerializer,
    IngredientSerializer,
    LocationSerializer,
    LocationContainersSerializer,
    LocationMenuSerializer,
    LocationWriteSerializer,
    LocationTypeSerializer,
    ChemicalStorageCategoriesSerializer,
    WeightReadingSerializer,
    WeightReadingReadSerializer,
)
from django.db.models import (
    Count,
    Q,
    F,
    ProtectedError,
    OuterRef,
    Subquery,
    ExpressionWrapper,
    FloatField,
)
from django.db import transaction

from .permissions import IsManager, IsCoordinator


class ChemicalView(ModelViewSet):
    serializer_class = ChemicalSerializer
    queryset = Chemical.objects.all()

    permission_classes = [IsAuthenticated]

    # Only managers allowed to delete
    def get_permissions(self):
        if self.action in ["destroy"]:
            return [permission() for permission in [IsManager]]
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action == "create":
            return ChemicalWriteSerializer
        return super().get_serializer_class()

    # Returns any mixtures or chemicals associated with the provided cas nums
    @action(detail=False, methods=["get"])
    def check_cas(self, request):
        q = Chemical.objects.all()
        cas_param = request.query_params.get("cas")
        if cas_param:
            cas = cas_param.split(",")
            mixtures = q.annotate(
                total_ingredients=Count("ingredients", distinct=True),
                matching_ingredients=Count(
                    "ingredients",
                    filter=Q(ingredients__ingredient__cas__in=cas),
                    distinct=True,
                ),
            ).filter(
                total_ingredients=len(cas),
                matching_ingredients=F("total_ingredients"),
            )
            chemicals = q
            chemicals = chemicals.filter(cas__in=cas)
            mixtures = ChemicalSerializer(mixtures, many=True).data
            chemicals = ChemicalSerializer(chemicals, many=True).data
            return Response({"mixtures": mixtures, "chemicals": chemicals})


class ContainerView(ModelViewSet):
    queryset = Container.objects.all()
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["id"]
    ordering = ["id"]
    lookup_field = "slug"

    permission_classes = [IsAuthenticated]

    # Only managers can delete
    def get_permissions(self):
        if self.action in ["destroy"]:
            return [permission() for permission in [IsManager]]
        return super().get_permissions()

    # Determine which serialize to use
    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update", "metadata"]:
            return ContainerWriteSerializer
        elif self.action in ["check_out", "check_in"]:
            return CheckoutEventSerializer
        else:
            return ContainerSerializer

    # Validates if a container has been discarded
    @action(detail=True, methods=["get"])
    def is_discarded(self, request, slug=None):
        try:
            q = self.get_object()
            return Response(
                {"is_discarded": q.date_discarded is not None}, status=status.HTTP_200_OK
            )
        except Http404:
            return Response({"is_valid": False}, status=status.HTTP_200_OK)

    # Creates checkout events for the provided containers
    @action(detail=False, methods=["POST"])
    def check_out(self, request):
        data = request.data

        events = []
        for slug in data:
            try:
                container = Container.objects.get(slug=slug)
                events.append({"container": container.id, "action": "out"})
            except Container.DoesNotExist:
                return Response(status=status.HTTP_400_BAD_REQUEST)
        serializer = CheckoutEventWriteSerializer(
            data=events, many=True, context={"request": request}
        )
        if serializer.is_valid(raise_exception=True):
            serializer.save()
            return Response({"events": serializer.data}, status=status.HTTP_201_CREATED)

    # Creates check in events for the provided containers
    @action(detail=False, methods=["POST"])
    def check_in(self, request):
        data = request.data

        events = []
        for slug in data:
            try:
                container = Container.objects.get(slug=slug)
                # Adds a relation to the most recent event if it is a checkout event
                try:
                    last_check_out = container.events.filter(
                        related_event__exact=None, action__exact="out"
                    ).order_by("-timestamp")[:1][0]
                except IndexError:
                    last_check_out = None
                events.append(
                    {
                        "container": container.id,
                        "action": "in",
                        "related_event": last_check_out.id if last_check_out is not None else None,
                    }
                )
            except Container.DoesNotExist:
                return Response(status.HTTP_400_BAD_REQUEST)
        serializer = CheckoutEventWriteSerializer(
            data=events, many=True, context={"request": request}
        )
        if serializer.is_valid(raise_exception=True):
            serializer.save()
            return Response({"events": serializer.data}, status=status.HTTP_201_CREATED)

    # Returns if the provided container is valid or not
    @action(detail=True, methods=["GET"])
    def is_valid(self, request, slug=None):
        try:
            self.get_object()
            return Response({"is_valid": True}, status=status.HTTP_200_OK)
        except Http404:
            return Response({"is_valid": False}, status=status.HTTP_200_OK)

    # Creates new Mixture, chemicals, and containers
    @transaction.atomic
    def create(self, request):
        chemicals = Chemical.objects.all()

        data = request.data

        # Creates a new parent chemical if one does not exist already
        if data.get("multiple_cas"):
            if data.get("mixture_id") != "":
                chemical = Chemical.objects.get(pk=data.get("mixture_id"))
            else:
                mixture_data = {
                    "name": data.get("mixture_name"),
                    "molecular_weight": data.get("mixture_molecular_weight"),
                    "storage_category": data.get("mixture_storage_category"),
                }
                chemical_serializer = ChemicalSerializer(data=mixture_data)
                chemical_serializer.is_valid(raise_exception=True)
                chemical = chemical_serializer.save()
            # Gets or creates children chemicals creates ingredients for the parent chemical
            request_chems = data.get("chemicals")
            for chem in request_chems:
                serializer = ChemicalSerializer(data=chem)
                try:
                    print(chem.get("cas"))
                    c = chemicals.get(cas=chem.get("cas"))
                except Chemical.DoesNotExist:
                    serializer.is_valid(raise_exception=True)
                    c = serializer.save()

                ingredient_data = {"mixture": chemical.id, "ingredient": c.id}

                ingredient = IngredientSerializer(data=ingredient_data)
                ingredient.is_valid(raise_exception=True)
                ingredient.save()

        else:
            # Handles creating a single chemical if only one cas# was provided
            request_chem = data.get("chemicals")[0]
            chemical, created = Chemical.objects.get_or_create(cas=request_chem.get("cas"))
            if created:
                chemical.molecular_weight = request_chem.get("molecular_weight")
                chemical.name = request_chem.get("name")
                chemical.storage_category = request_chem.get("storage_category")
        # Creates the new container
        new_container = {
            "name": data.get("name"),
            "chemical": chemical.id,
            "location": data.get("location"),
            "manufacturer": data.get("manufacturer"),
            "initial_quantity": data.get("initial_quantity"),
            "quantity_unit": data.get("quantity_unit"),
            "product_num": data.get("product_num"),
            "date_received": data.get("date_received"),
            "density": data.get("density"),
            "expiration_date": data.get("expiration_date"),
            "initial_weight": data.get("initial_weight"),
            "tare_weight": data.get("tare_weight"),
        }
        serializer = ContainerWriteSerializer(data=new_container)
        serializer.is_valid(raise_exception=True)
        container = serializer.save()
        container.slug = f"chem-{container.id}"
        container.save()
        wr = {
            "container": container.id,
            "weight": container.initial_weight,
        }

        wr_serializer = WeightReadingSerializer(data=wr, context={"request": request})
        wr_serializer.is_valid(raise_exception=True)
        wr_serializer.save()

        # TODO: Reset IDs on failed creates
        return Response(ContainerSerializer(container).data, status=status.HTTP_201_CREATED)

    # Creates new weigh in event
    @action(detail=True, methods=["GET", "POST"])
    def weigh_in(self, request, slug=None):
        container = self.get_object()

        if request.method == "POST":
            data = request.data

            weigh_in = {
                "container": container.id,
                "weight": data.get("weight"),
            }

            serializer = WeightReadingSerializer(data=weigh_in, context={"request": request})
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        elif request.method == "GET":
            events = container.readings
            serializer = WeightReadingReadSerializer(data=events, many=True)
            serializer.is_valid()
            return Response(serializer.data, status=status.HTTP_200_OK)


class LocationView(ModelViewSet):
    queryset = Location.objects.all()

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
        return Response(LocationSerializer(location).data, status=status.HTTP_201_CREATED)

    # Returns the locations in a format easily usable in select menus
    @action(detail=False, methods=["GET"])
    def menu(self, request):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    # Adds a new child location
    @action(detail=True, methods=["POST"])
    def add_child(self, request, pk=None):
        data = request.data
        parent = self.get_object()

        data["parent"] = parent.id
        serializer = LocationWriteSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        location = serializer.save()

        response_serializer = LocationSerializer(location)

        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

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


class ChemicalStorageCategoryView(ModelViewSet):
    queryset = ChemicalStorageCategories.objects.all()
    serializer_class = ChemicalStorageCategoriesSerializer

    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ["destroy"]:
            return [permission() for permission in [IsManager]]
        return super().get_permissions()

    def get_queryset(self):
        queryset = super().get_queryset()
        sorted = natsorted(queryset, key=lambda obj: obj.shorthand)

        return sorted


class WeightReadingView(ModelViewSet):
    queryset = WeightReading.objects.all()
    serializer_class = WeightReadingSerializer

    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ["destroy"]:
            return [permission() for permission in [IsManager]]
        return super().get_permissions()


# class DashboardView(ModelViewSet):
#     queryset = Container.objects.all()
#     serializer_class = ContainerSerializer

#     permission_classes = [IsAuthenticated]

#     most_recent_reading_time = WeightReading.objects.filter(
#         container_id=OuterRef('pk')
#     ).order_by('-recorded_at').values('recorded_at')[:1]

#     most_recent_reading_weight = WeightReading.objects.filter(
#         container_id=OuterRef('pk')
#     ).order_by('-recorded_at').values('weight')[:1]


#     restock_soon = Container.objects.annotate(
#         most_recent_reading_time=Subquery(most_recent_reading_time)
#     ).annotate(most_recent_reading_weight=Subquery(most_recent_reading_weight)).order_by('most_recent_reading_time').annotate(
#         percent_remaining=ExpressionWrapper(F('most_recent_reading_weight')/F('initial_weight'), output_field=FloatField())
#     ).filter(percent_remaining__lte=0.1)[:5]


#     def list(self, request):
#         queryset = self.get_queryset()
#         recently_added = queryset.order_by('-date_received')[:5]
#         restock_soon = queryset.annotate(percentage_remaining=(((readings__ - tare_weight)/initial_content_mass) * 100)).filter(percentage_remaining__lte=10)
#         checked_out = queryset.filter(checkout_status_action__exact="out", checkout_status_related_event=None).order_by('-checkout_status_timestamp')[:5]
