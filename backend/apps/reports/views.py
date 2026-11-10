from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAuthenticated
from apps.users.permissions import role_at_least
from rest_framework.viewsets import ViewSet
from rest_framework.response import Response
from apps.users.models import User
from apps.reports.registry import return_registry
from apps.inventory.serializers import ContainerSerializer
from apps.reports.query import run_query
from rest_framework.serializers import ValidationError
from apps.inventory.schema import ERROR_DETAIL
from apps.reports.serializers import RegistryResponseSerializer, QueryRequestSerializer


class RegistryView(ViewSet):
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        return [role_at_least(User.Role.STOCKROOM)()]

    @extend_schema(request=None, responses=RegistryResponseSerializer(many=True))
    def list(self, request, *args, **kwargs):

        return Response(return_registry())


class QueryView(ViewSet):
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        return [role_at_least(User.Role.STOCKROOM)()]

    @extend_schema(
        request=QueryRequestSerializer,
        responses={200: ContainerSerializer(many=True), 400: ERROR_DETAIL},
    )
    def create(self, request):
        try:
            serializer = QueryRequestSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            queryset = run_query(serializer.validated_data).for_display().order_by("id")
        except ValueError as error:
            raise ValidationError({"detail": str(error)})
        data = ContainerSerializer(queryset, many=True).data

        return Response(data)
