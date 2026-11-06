from functools import partial
from enum import StrEnum, auto
from dataclasses import dataclass, field
from apps.inventory.models import Container, most_recent_checkout_event_subquery, WeightReading
from apps.inventory.models.containers import GRAMS_PER_UNIT, ML_PER_UNIT
from django.db.models import (
    Case,
    DecimalField,
    ExpressionWrapper,
    F,
    OuterRef,
    Subquery,
    Value,
    When,
)
from django.db.models.functions import NullIf, Round


class FieldTypes(StrEnum):
    TEXT = auto()
    NUMBER = auto()
    DATE = auto()
    CHOICE = auto()
    BOOLEAN = auto()
    LOCATION = auto()


type_operations = {
    FieldTypes.TEXT: ["contains", "equals", "is_empty", "is_not_empty"],
    FieldTypes.NUMBER: ["eq", "lt", "lte", "gt", "gte", "is_empty", "is_not_empty"],
    FieldTypes.DATE: [
        "before",
        "after",
        "on",
        "older_than_days",
        "within_days",
        "is_empty",
    ],
    FieldTypes.CHOICE: ["is", "is_any_of"],
    FieldTypes.BOOLEAN: ["is"],
    FieldTypes.LOCATION: ["in"],
}

empty_rules = {
    FieldTypes.TEXT: {"__isnull": True, "__iexact": ""},
    FieldTypes.NUMBER: {"__isnull": True},
    FieldTypes.DATE: {"__isnull": True},
}


@dataclass(frozen=True)
class Field:
    key: str
    label: str
    type: FieldTypes
    path: str
    choices: list = field(default_factory=list)
    nullable: bool = False
    empty_when: dict | None = None
    date_overrides: dict | None = None
    datetime: bool = False
    annotation: callable | None = None


container_name = Field(
    key="name",
    label="Name",
    type=FieldTypes.TEXT,
    nullable=False,
    path="name",
)

container_manufacturer = Field(
    key="manufacturer",
    label="Manufacturer",
    type=FieldTypes.TEXT,
    nullable=True,
    path="manufacturer",
)

container_tare_weight = Field(
    key="tare_weight",
    label="Tare Weight",
    type=FieldTypes.NUMBER,
    nullable=True,
    path="tare_weight",
    empty_when={"__isnull": True, "__lte": 0},
)

# Null = received before inventory tracking began
container_date_received = Field(
    key="date_received",
    label="Date Received",
    type=FieldTypes.DATE,
    nullable=True,
    path="date_received",
    date_overrides={
        "older_than_days": {"rules": {"__lt": None, "__isnull": True}, "operator": "or"},
        "before": {"rules": {"__lt": None, "__isnull": True}, "operator": "or"},
    },
)

container_unit = Field(
    key="unit",
    label="Unit",
    type=FieldTypes.CHOICE,
    nullable=True,
    path="quantity_unit",
    choices=Container.QUANTITY_UNIT_CHOICES,
)

container_date_discarded = Field(
    key="date_discarded",
    label="Date Discarded",
    type=FieldTypes.DATE,
    nullable=True,
    path="date_discarded",
)

container_date_created = Field(
    key="created_at",
    label="Date Created",
    type=FieldTypes.DATE,
    nullable=True,
    path="created_at",
    datetime=True,
)

container_last_checkout = Field(
    key="last_checkout",
    label="Last Time Checked Out",
    type=FieldTypes.DATE,
    nullable=True,
    path="last_checkout",
    datetime=True,
    date_overrides={
        "older_than_days": {"rules": {"__lt": None, "__isnull": True}, "operator": "or"}
    },
    annotation=lambda: Subquery(most_recent_checkout_event_subquery("timestamp")),
)


def last_weigh_in_subquery(field: str):
    return Subquery(
        WeightReading.objects.filter(container_id=OuterRef("pk"))
        .order_by(*WeightReading.NEWEST_FIRST)
        .values(field)[:1]
    )


container_last_weighed = Field(
    key="last_weighed",
    label="Last Time Weighed",
    type=FieldTypes.DATE,
    nullable=True,
    path="last_weighed",
    datetime=True,
    annotation=partial(last_weigh_in_subquery, "recorded_at"),
)

container_current_weight = Field(
    key="current_weight",
    label="Current Weight",
    type=FieldTypes.NUMBER,
    nullable=True,
    path="current_weight",
    empty_when={"__isnull": True},
    annotation=partial(last_weigh_in_subquery, "weight"),
)


def _decimal(expression):
    return ExpressionWrapper(expression, output_field=DecimalField())


def _content_mass():
    """Container.initial_content_mass as SQL: the original contents in grams.

    A mass unit is multiplied by its factor from GRAMS_PER_UNIT; a volume by
    its factor from ML_PER_UNIT and then by the density. A row matching no
    When (no unit) gets the Case's default, NULL, and a missing quantity or
    density makes the product NULL, the same cases where the property
    returns None.
    """
    # initial_quantity is an integer and the factors are decimals; Django
    # won't guess the type of mixed arithmetic, so ExpressionWrapper states it
    by_mass = [
        When(quantity_unit=unit, then=_decimal(F("initial_quantity") * Value(factor)))
        for unit, factor in GRAMS_PER_UNIT.items()
    ]
    by_volume = [
        When(
            quantity_unit=unit,
            then=_decimal(F("initial_quantity") * Value(factor) * F("density")),
        )
        for unit, factor in ML_PER_UNIT.items()
    ]
    return Case(*by_mass, *by_volume, output_field=DecimalField())


def percent_remaining():
    """Container.percent_remaining as SQL, so reports can filter on it.

    (latest weight - tare) / content mass * 100, rounded to a whole number.
    NULL wherever the property returns None. tests/test_reports_query.py
    checks the two agree.
    """
    latest_weight = last_weigh_in_subquery("weight")
    # Postgres raises an error on division by zero rather than returning
    # NULL; NullIf turns a zero content mass into NULL first
    content_mass = NullIf(_content_mass(), Value(0))
    percent = _decimal((latest_weight - F("tare_weight")) / content_mass * Value(100))
    return Case(
        # A tare of 0 or less counts as missing (Container.has_estimated_usage)
        When(tare_weight__lte=0, then=Value(None)),
        default=Round(percent),
        output_field=DecimalField(),
    )


container_percent_remaining = Field(
    key="percent_remaining",
    label="Percent Remaining",
    type=FieldTypes.NUMBER,
    nullable=True,
    # Not "percent_remaining": Django sets each annotation as an attribute on
    # the returned containers, and that name is Container's read-only property
    path="percent_remaining_sql",
    annotation=percent_remaining,
)


container_filter_fields = [
    container_name,
    container_manufacturer,
    container_tare_weight,
    container_date_received,
    container_unit,
    container_date_discarded,
    container_date_created,
    container_current_weight,
    container_last_checkout,
    container_last_weighed,
    container_percent_remaining,
]


def _check_registry(fields, operations):
    missing_keys = []
    for name, member in FieldTypes.__members__.items():
        if member.value not in operations:
            missing_keys.append(name)
    if missing_keys:
        raise KeyError(f"type_operations missing key(s): {missing_keys}")

    seen = set()
    duplicates = []

    for f in fields:
        if f.key in seen:
            duplicates.append(f.key)
        else:
            seen.add(f.key)
    if duplicates:
        raise ValueError(
            f"Fields must have unique keys. The following duplicates were found: {duplicates}"
        )


_check_registry(container_filter_fields, type_operations)


def return_registry():
    formatted = []
    for f in container_filter_fields:
        formatted.append(
            {
                "key": f.key,
                "label": f.label,
                "type": f.type,
                "operations": type_operations[f.type],
                "choices": [{"value": value, "label": label} for value, label in f.choices]
                if f.choices
                else [],
            }
        )
    return formatted
