from rest_framework.viewsets import ModelViewSet
from rest_framework import filters, status
from rest_framework.decorators import action
from natsort import natsorted
from rest_framework.response import Response
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
    LocationSerializer,
    ChemicalStorageCategoriesSerializer,
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
        return ContainerSerializer

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
