from rest_framework.viewsets import ModelViewSet
from rest_framework import filters
from .models import Container, Chemical, Location
from .serializers import (
    ContainerSerializer,
    ContainerWriteSerializer,
    ChemicalSerializer,
    LocationSerializer,
)
from django.db.models import Count, Q, F


class ChemicalView(ModelViewSet):
    serializer_class = ChemicalSerializer

    def get_queryset(self):
        queryset = Chemical.objects.all()
        cas_param = self.request.query_params.get('cas')
        if cas_param:
            cas = cas_param.split(",")
            if len(cas) > 1:
                queryset = queryset.annotate(
                    total_ingredients=Count("ingredients", distinct=True),
                    matching_ingredients=Count("ingredients", filter=Q(ingredients__ingredient__cas__in=cas), distinct=True)
                ).filter(
                    total_ingredients=len(cas),
                    matching_ingredients=F("total_ingredients")
                )
            elif len(cas) == 1:
                queryset = queryset.filter(cas=cas[0])
        
        return queryset

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
