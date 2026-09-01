from django.db.models import ExpressionWrapper, F, FloatField, OuterRef, Subquery
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from ..models import CheckoutEvent, Container, WeightReading
from ..serializers import ContainerSerializer


class DashboardView(ModelViewSet):
    queryset = Container.objects.all()
    serializer_class = ContainerSerializer

    permission_classes = [IsAuthenticated]

    most_recent_reading_time = (
        WeightReading.objects.filter(container_id=OuterRef("pk"))
        .order_by("-recorded_at")
        .values("recorded_at")[:1]
    )

    most_recent_reading_weight = (
        WeightReading.objects.filter(container_id=OuterRef("pk"))
        .order_by("-recorded_at")
        .values("weight")[:1]
    )

    most_recent_event = (
        CheckoutEvent.objects.filter(container_id=OuterRef("pk"))
        .order_by("-timestamp")
        .values("timestamp")[:1]
    )

    most_recent_event_action = (
        CheckoutEvent.objects.filter(container_id=OuterRef("pk"))
        .order_by("-timestamp")
        .values("action")[:1]
    )

    def list(self, request):
        queryset = self.get_queryset()
        recently_added = queryset.filter(date_received__isnull=False).order_by("-date_received")[:5]
        checked_out = (
            Container.objects.annotate(most_recent_event=Subquery(self.most_recent_event))
            .annotate(most_recent_event_action=Subquery(self.most_recent_event_action))
            .order_by("-most_recent_event")
            .filter(most_recent_event_action="out")[:5]
        )

        restock_soon = (
            Container.objects.annotate(
                most_recent_reading_time=Subquery(self.most_recent_reading_time)
            )
            .annotate(most_recent_reading_weight=Subquery(self.most_recent_reading_weight))
            .order_by("most_recent_reading_time")
            .annotate(
                percent_remaining=ExpressionWrapper(
                    F("most_recent_reading_weight") / F("initial_weight"), output_field=FloatField()
                )
            )
            .filter(percent_remaining__lte=0.1)[:5]
        )

        return_dict = {
            "recently_added": ContainerSerializer(recently_added, many=True).data,
            "checked_out": ContainerSerializer(checked_out, many=True).data,
            "restock_soon": ContainerSerializer(restock_soon, many=True).data,
        }

        return Response(return_dict, status=status.HTTP_200_OK)
