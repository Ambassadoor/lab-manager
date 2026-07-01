from rest_framework.viewsets import ModelViewSet
from rest_framework import filters, status
from rest_framework.decorators import action
from natsort import natsorted
from rest_framework.response import Response
from django.http import Http404
from .models import (
    Container,
    Chemical,
    Location,
    ChemicalStorageCategories,
    Ingredient,
    WeightReading,
)
from .serializers import (
    ContainerSerializer,
    ContainerWriteSerializer,
    ChemicalSerializer,
    CheckoutEventSerializer,
    CheckoutEventWriteSerializer,
    LocationSerializer,
    ChemicalStorageCategoriesSerializer,
    WeightReadingSerializer,
)
from django.db.models import Count, Q, F
from django.db import transaction


class ChemicalView(ModelViewSet):
    serializer_class = ChemicalSerializer
    queryset = Chemical.objects.all()

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

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update", "metadata"]:
            return ContainerWriteSerializer
        elif self.action in ["check_out", "check_in"]:
            return CheckoutEventSerializer
        else:
            return ContainerSerializer

    @action(detail=True, methods=["get"])
    def is_discarded(self, request, slug=None):
        try:
            q = self.get_object()
            return Response(
                {"is_discarded": q.date_discarded is not None}, status=status.HTTP_200_OK
            )
        except Http404:
            return Response({"is_valid": False}, status=status.HTTP_404_NOT_FOUND)

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

    @action(detail=False, methods=["POST"])
    def check_in(self, request):
        data = request.data

        events = []
        for slug in data:
            try:
                container = Container.objects.get(slug=slug)
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

    @action(detail=True, methods=["GET"])
    def is_valid(self, request, slug=None):
        try:
            self.get_object()
            return Response({"is_valid": True}, status=status.HTTP_200_OK)
        except Http404:
            return Response({"is_valid": False}, status=status.HTTP_404_NOT_FOUND)

    @transaction.atomic
    def create(self, request):
        user = request.user
        chemicals = Chemical.objects.all()

        data = request.data

        if data.get("multiple_cas"):
            if data.get("mixture_id") != "":
                chemical = Chemical.objects.get(pk=data.get("mixture_id"))
            else:
                mixture_data = {
                    "name": data.get("mixture_name"),
                    "cas": data.get("mixture_cas"),
                    "molecular_weight": data.ge("molecular_weight"),
                }
                if ChemicalSerializer(data=mixture_data).isValid():
                    chemical = Chemical.objects.create(mixture_data)
                else:
                    pass
            request_chems = data.get("chemicals")
            for chem in request_chems:
                serializer = ChemicalSerializer(data=chem)
                serializer.isValid(raise_exception=True)
                c, _ = chemicals.get_or_create(cas=chem.get("cas"))
                Ingredient.objects.create({"mixture": chemical, "ingredient": c.id})

        else:
            request_chem = data.get("chemicals")[0]
            chemical, created = Chemical.objects.get_or_create(cas=request_chem.get("cas"))
            if created:
                chemical.molecular_weight = request_chem.get("molecular_weight")
                chemical.name = request_chem.get("name")
                chemical.storage_category = request_chem.get("storage_category")
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
        WeightReading.objects.create(
            **{"container": container, "weight": container.initial_weight, "recorded_by": user}
        )
        # TODO: Reset IDs on failed creates
        return Response(ContainerSerializer(container).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["POST"])
    def weigh_in(self, request, slug=None):
        container = self.get_object()
        data = request.data

        weigh_in = {
            "container": container.id,
            "weight": data.get("weight"),
        }

        serializer = WeightReadingSerializer(data=weigh_in, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class LocationView(ModelViewSet):
    queryset = Location.objects.all()
    serializer_class = LocationSerializer


class ChemicalStorageCategoryView(ModelViewSet):
    queryset = ChemicalStorageCategories.objects.all()
    serializer_class = ChemicalStorageCategoriesSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        sorted = natsorted(queryset, key=lambda obj: obj.shorthand)

        return sorted


class WeightReadingView(ModelViewSet):
    queryset = WeightReading.objects.all()
    serializer_class = WeightReadingSerializer
