from django.db.models import Count, F, Q
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import (
    OpenApiParameter,
    extend_schema,
    extend_schema_view,
    inline_serializer,
)
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


# Writes go through ChemicalWriteSerializer but respond with the full
# chemical; tell the schema so the generated frontend types match.
@extend_schema_view(
    create=extend_schema(responses={201: ChemicalSerializer}),
    update=extend_schema(responses=ChemicalSerializer),
    partial_update=extend_schema(responses=ChemicalSerializer),
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
        if self.action in {"create", "update", "partial_update"}:
            return ChemicalWriteSerializer
        return super().get_serializer_class()

    # The nested storage category and ingredients, loaded once for the whole
    # list instead of once per chemical (finding 5). The SDS are loaded by
    # ChemicalListSerializer.
    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .select_related("storage_category")
            .prefetch_related("ingredients")
        )

    # Returns any mixtures or chemicals associated with the provided cas nums
    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="cas",
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                description="Comma-separated CAS numbers",
            )
        ],
        responses=inline_serializer(
            name="CasCheck",
            fields={
                "mixtures": ChemicalSerializer(many=True),
                "chemicals": ChemicalSerializer(many=True),
            },
        ),
    )
    @action(detail=False, methods=["get"])
    def check_cas(self, request):
        q = self.get_queryset()
        cas_param = request.query_params.get("cas")
        # No CAS numbers means nothing can match. Without this the view fell
        # off the end and returned None, which DRF turns into a 500.
        if not cas_param:
            return Response({"mixtures": [], "chemicals": []})
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
