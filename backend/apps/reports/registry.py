from enum import StrEnum, auto
from dataclasses import dataclass, field
from apps.inventory.models import Container


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


@dataclass(frozen=True)
class Field:
    key: str
    label: str
    type: FieldTypes
    path: str
    choices: list = field(default_factory=list)
    nullable: bool = False


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
)

container_date_received = Field(
    key="date_received",
    label="Date Received",
    type=FieldTypes.DATE,
    nullable=True,
    path="date_received",
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

container_filter_fields = [
    container_name,
    container_manufacturer,
    container_tare_weight,
    container_date_received,
    container_unit,
    container_date_discarded,
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
                **({"choices": f.choices} if f.choices else {}),
            }
        )
    return formatted
