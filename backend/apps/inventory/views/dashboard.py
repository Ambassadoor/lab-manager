from django.db.models import Subquery
from drf_spectacular.openapi import AutoSchema
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import mixins, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from ..models import Container, most_recent_checkout_event_subquery
from ..serializers import ContainerSerializer


# drf-spectacular assumes a `list` action answers with an array of whatever
# serializer it's given. This one answers with a single object of three
# lists, so the schema must be told it isn't a list view.
class _SingleObjectSchema(AutoSchema):
    def _is_list_view(self, serializer=None):
        return False


# List only. As a ModelViewSet this also exposed create/update/destroy on
# Container at /dashboard/<pk>/ behind nothing but IsAuthenticated, bypassing
# ContainerView's role checks.
class DashboardView(mixins.ListModelMixin, GenericViewSet):
    queryset = Container.objects.all()
    serializer_class = ContainerSerializer

    permission_classes = [IsAuthenticated]
    schema = _SingleObjectSchema()

    most_recent_event = most_recent_checkout_event_subquery("timestamp")
    most_recent_event_action = most_recent_checkout_event_subquery("action")

    @extend_schema(
        responses=inline_serializer(
            name="Dashboard",
            fields={
                "recently_added": ContainerSerializer(many=True),
                "checked_out": ContainerSerializer(many=True),
                "restock_soon": ContainerSerializer(many=True),
            },
        )
    )
    def list(self, request):
        queryset = self.get_queryset()
        recently_added = (
            queryset.for_display()
            .filter(date_received__isnull=False)
            .order_by("-date_received")[:5]
        )
        checked_out = (
            Container.objects.for_display()
            .annotate(most_recent_event=Subquery(self.most_recent_event))
            .annotate(most_recent_event_action=Subquery(self.most_recent_event_action))
            .order_by("-most_recent_event")
            .filter(most_recent_event_action="out")[:5]
        )

        # percent_remaining isn't a plain DB column — see
        # Container.percent_remaining's docstring for why it can't reduce to
        # a single SQL expression (this replaced a version that tried
        # anyway, with a formula quietly different from the real one).
        # Narrowed to containers that could plausibly qualify before
        # evaluating the property, so this isn't done for every container
        # in the database. for_display() prefetches each candidate's latest
        # reading, so scoring them costs no query per container.
        candidates = (
            Container.objects.filter(readings__isnull=False, tare_weight__gt=0)
            .distinct()
            .for_display()
            # Ties on percent_remaining keep this order, so which containers
            # make the top five doesn't depend on unspecified row order.
            .order_by("pk")
        )
        scored = [(c, c.percent_remaining) for c in candidates]
        low_on_stock = sorted(
            (pair for pair in scored if pair[1] is not None and pair[1] <= 10),
            key=lambda pair: pair[1],
        )
        restock_soon = [c for c, _ in low_on_stock[:5]]

        return_dict = {
            "recently_added": ContainerSerializer(recently_added, many=True).data,
            "checked_out": ContainerSerializer(checked_out, many=True).data,
            "restock_soon": ContainerSerializer(restock_soon, many=True).data,
        }

        return Response(return_dict, status=status.HTTP_200_OK)
