from rest_framework.viewsets import ModelViewSet
from rest_framework import filters
from rest_framework.decorators import action
from natsort import natsorted
from rest_framework.response import Response
from .models import Container, Chemical, Location, ChemicalStorageCategories
from .serializers import (
    ContainerSerializer,
    ContainerWriteSerializer,
    ChemicalSerializer,
    LocationSerializer,
    ChemicalStorageCategoriesSerializer,
)
from django.db.models import Count, Q, F


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

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update", "metadata"]:
            return ContainerWriteSerializer
        return ContainerSerializer


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
