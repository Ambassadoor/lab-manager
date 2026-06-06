from django.contrib.auth import get_user_model
from django.utils.decorators import method_decorator
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ViewSet

from .serializers import ChemicalSerializer, ContainerSerializer


class Chemical(ViewSet):
    def create(self, request):
        pass

    def retrieve(self, request, pk=None):
        pass

    def list(self, request):
        pass

    def update(self, request, pk=None):
        pass


class Container(ViewSet):
    def create(self, request):
        pass

    def retrieve(self, request, pk=None):
        pass

    def list(self, request):
        pass

    def update(self, request, pk=None):
        pass

    def destroy(self, request, pk=None):
        pass

class Location(ViewSet):
    def create(self, request):
        pass

    def retrieve(self, request, pk=None):
        pass

    def list(self, request):
        pass

    def update(self, request, pk=None):
        pass

    def destroy(self, request, pk=None):
        pass
