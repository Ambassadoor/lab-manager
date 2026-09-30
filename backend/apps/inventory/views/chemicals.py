from django.db.models import Count, F, Q
from natsort import natsorted
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.users.models import User
from apps.users.permissions import role_at_least

from ..filters import ChemicalFilter
from ..models import Chemical, ChemicalStorageCategories
from ..serializers import (
    ChemicalSerializer,
    ChemicalStorageCategoriesSerializer,
    ChemicalWriteSerializer,
)


class ChemicalView(ModelViewSet):
    serializer_class = ChemicalSerializer
    queryset = Chemical.objects.all()
    filterset_class = ChemicalFilter
    search_fields = ["name", "cas", "formula", "iupac"]
    ordering_fields = ["name", "cas", "molecular_weight"]

    permission_classes = [IsAuthenticated]

    # Deleting a chemical is Manager/Admin-only — chemicals aren't deleted
    # in normal operation, a mistake gets corrected in place instead.
    def get_permissions(self):
        if self.action == "destroy":
            return [role_at_least(User.Role.LAB_MANAGER)()]
        if self.action in {"create", "update", "partial_update"}:
            return [role_at_least(User.Role.STOCKROOM)()]
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


class ChemicalStorageCategoryView(ModelViewSet):
    queryset = ChemicalStorageCategories.objects.all()
    serializer_class = ChemicalStorageCategoriesSerializer

    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action == "destroy":
            return [role_at_least(User.Role.LAB_MANAGER)()]
        if self.action in {"create", "update", "partial_update"}:
            return [role_at_least(User.Role.STOCKROOM)()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = super().get_queryset()
        sorted = natsorted(queryset, key=lambda obj: obj.shorthand)

        return sorted
