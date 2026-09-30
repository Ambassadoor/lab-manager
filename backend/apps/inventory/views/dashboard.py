from django.db.models import Subquery
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from ..models import Container, most_recent_checkout_event_subquery
from ..serializers import ContainerSerializer


class DashboardView(ModelViewSet):
    queryset = Container.objects.all()
    serializer_class = ContainerSerializer

    permission_classes = [IsAuthenticated]

    most_recent_event = most_recent_checkout_event_subquery("timestamp")
    most_recent_event_action = most_recent_checkout_event_subquery("action")

    def list(self, request):
        queryset = self.get_queryset()
        recently_added = queryset.filter(date_received__isnull=False).order_by("-date_received")[:5]
        checked_out = (
            Container.objects.annotate(most_recent_event=Subquery(self.most_recent_event))
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
        # in the database; still one query per candidate container, same
        # trade-off ContainerSerializer already accepts for this field.
        candidates = Container.objects.filter(readings__isnull=False, tare_weight__gt=0).distinct()
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
