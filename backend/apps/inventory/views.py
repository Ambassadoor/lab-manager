from rest_framework.viewsets import ModelViewSet
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

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return ContainerWriteSerializer
        return ContainerSerializer


class LocationView(ModelViewSet):
    queryset = Location.objects.all()
    serializer_class = LocationSerializer
