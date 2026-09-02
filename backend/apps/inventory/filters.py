import django_filters as df
from django.db.models import Q, Subquery

from .models import (
    Chemical,
    CheckoutEvent,
    Container,
    Location,
    most_recent_checkout_event_subquery,
)


class ContainerFilter(df.FilterSet):
    name = df.CharFilter(lookup_expr="icontains")
    manufacturer = df.CharFilter(lookup_expr="icontains")
    product_num = df.CharFilter(lookup_expr="icontains")
    date_received_after = df.DateFilter(field_name="date_received", lookup_expr="gte")
    date_received_before = df.DateFilter(field_name="date_received", lookup_expr="lte")
    expiration_date_after = df.DateFilter(field_name="expiration_date", lookup_expr="gte")
    expiration_date_before = df.DateFilter(field_name="expiration_date", lookup_expr="lte")
    is_opened = df.BooleanFilter(method="filter_is_opened")
    is_discarded = df.BooleanFilter(method="filter_is_discarded")
    has_estimated_usage = df.BooleanFilter(method="filter_has_estimated_usage")
    checkout_status = df.ChoiceFilter(
        choices=CheckoutEvent.ACTION_CHOICES, method="filter_checkout_status"
    )

    class Meta:
        model = Container
        # chemical/location (FK) and quantity_unit (choices field) get their
        # exact-match filters auto-generated from the model field type.
        fields = ["name", "manufacturer", "product_num", "chemical", "location", "quantity_unit"]

    def filter_is_opened(self, queryset, name, value):
        return queryset.filter(date_opened__isnull=not value)

    def filter_is_discarded(self, queryset, name, value):
        return queryset.filter(date_discarded__isnull=not value)

    def filter_has_estimated_usage(self, queryset, name, value):
        # Mirrors Container.has_estimated_usage — a non-positive tare_weight
        # is treated the same as "missing" (see migration
        # 0026_null_placeholder_zero_tare_weights).
        if value:
            return queryset.filter(tare_weight__gt=0)
        return queryset.filter(Q(tare_weight__isnull=True) | Q(tare_weight__lte=0))

    def filter_checkout_status(self, queryset, name, value):
        most_recent_action = most_recent_checkout_event_subquery("action")
        return queryset.annotate(most_recent_event_action=Subquery(most_recent_action)).filter(
            most_recent_event_action=value
        )


class ChemicalFilter(df.FilterSet):
    name = df.CharFilter(lookup_expr="icontains")
    cas = df.CharFilter(lookup_expr="icontains")
    formula = df.CharFilter(lookup_expr="icontains")

    class Meta:
        model = Chemical
        # storage_category (FK) and is_organic (BooleanField) auto-generated.
        fields = ["name", "cas", "formula", "storage_category", "is_organic"]


class LocationFilter(df.FilterSet):
    name = df.CharFilter(lookup_expr="icontains")

    class Meta:
        model = Location
        # type (FK) auto-generated. `parent` deliberately not exposed here —
        # LocationView.get_queryset() already forces parent=None for the
        # plain list action, so a parent filter would be a silent no-op there.
        fields = ["name", "type"]
