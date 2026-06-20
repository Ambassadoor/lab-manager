from rest_framework.viewsets import ModelViewSet
from rest_framework import filters
from .models import Container, Chemical, Location
from .serializers import (
    ContainerSerializer,
    ContainerWriteSerializer,
    ChemicalSerializer,
    LocationSerializer,
)


class ChemicalView(ModelViewSet):
    queryset = Chemical.objects.all()
    serializer_class = ChemicalSerializer


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
