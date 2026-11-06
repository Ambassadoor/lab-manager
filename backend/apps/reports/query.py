import operator
import datetime

from datetime import timedelta
from functools import reduce
from apps.inventory.models.containers import Container
from apps.reports.registry import (
    FieldTypes,
    type_operations,
    container_filter_fields,
    empty_rules,
)
from django.db.models import Q
from django.utils import timezone
from decimal import Decimal, InvalidOperation

operations = {
    FieldTypes.TEXT: {
        "contains": "__icontains",
        "equals": "__iexact",
    },
    FieldTypes.NUMBER: {
        "eq": "__exact",
        "lt": "__lt",
        "lte": "__lte",
        "gt": "__gt",
        "gte": "__gte",
    },
    FieldTypes.DATE: {
        "before": "__lt",
        "after": "__gt",
        "on": "__exact",
        "older_than_days": "__lt",
        "within_days": "__gte",
    },
    FieldTypes.CHOICE: {"is": "__exact", "is_any_of": "__in"},
    FieldTypes.BOOLEAN: {"is": "__exact"},
    FieldTypes.LOCATION: {"in": "location__full_text__icontains"},
}

operators = {"or": operator.or_, "and": operator.and_}


def convert_to_q(field, operation, value=None):
    property_type = field.type
    path = field.path

    lookup = operations.get(property_type).get(operation)

    if operation in ["is_empty", "is_not_empty"]:
        rules = field.empty_when if field.empty_when is not None else empty_rules[property_type]
        q = reduce(operator.or_, [Q(**{f"{path}{k}": v}) for k, v in rules.items()])
        if operation == "is_not_empty":
            q = ~q

    elif field.type == FieldTypes.DATE:
        today = timezone.localdate()
        path = f"{path}{'__date' if field.datetime else ''}"
        if operation in ["older_than_days", "within_days"]:
            value = today - timedelta(days=value)
        if field.date_overrides is not None and operation in field.date_overrides:
            override = field.date_overrides[operation]
            rules = override["rules"]
            op = operators[override["operator"]]

            q = reduce(
                op,
                [Q(**{f"{path}{k}": value if v is None else v}) for k, v in rules.items()],
            )
        else:
            q = Q(**{f"{path}{lookup}": value})

    else:
        q = Q(**{f"{path}{lookup}": value})
    return q


def _is_valid_operator(definition):
    invalid_operators = []
    for condition in definition["conditions"]:
        current_field = next(
            (field for field in container_filter_fields if field.key == condition["field"]),
            None,
        )
        operation = condition["op"]
        allowed_operations = type_operations[current_field.type]
        if operation not in allowed_operations:
            invalid_operators.append(
                f"{condition['field']} does not support the {condition['op']} operation."
            )
    if invalid_operators:
        raise ValueError(f"The following invalid operators were submitted: {invalid_operators}")

    return True


def _is_valid_field_key(definition):
    invalid_field_keys = []
    for condition in definition["conditions"]:
        current_field = next(
            (field for field in container_filter_fields if field.key == condition["field"]),
            None,
        )
        if not current_field:
            invalid_field_keys.append(condition["field"])
    if invalid_field_keys:
        raise ValueError(f"The following fields are not supported: {invalid_field_keys}")

    return True


def _has_necessary_value(definition):
    missing_values = []
    for condition in definition["conditions"]:
        if condition.get("value") is None:
            if condition.get("op") not in ["is_empty", "is_not_empty"]:
                missing_values.append(condition["field"])
        else:
            field = next(f for f in container_filter_fields if f.key == condition.get("field"))
            value = condition.get("value")
            op = condition.get("op")
            if field.type == FieldTypes.NUMBER:
                try:
                    Decimal(value)
                except (InvalidOperation, ValueError, TypeError):
                    raise ValueError(f"The value for {field.label} must be a number")
            if field.type == FieldTypes.DATE:
                if op in ["older_than_days", "within_days"]:
                    try:
                        num = Decimal(value)
                        if not num % 1 == 0 or isinstance(value, str):
                            raise ValueError
                    except (ValueError, TypeError, InvalidOperation):
                        raise ValueError(
                            f"The value for {field.label} must be a whole number when using {op}"
                        )
                elif op == "is_empty":
                    raise ValueError(f"No value should be provided for {op}")
                else:
                    try:
                        datetime.date.fromisoformat(str(value))
                    except ValueError:
                        raise ValueError(f"The value for {field.label} must be a date")

    if missing_values:
        raise ValueError(f"The following fields are missing values: {missing_values}")

    return True


def run_query(definition):
    _is_valid_field_key(definition)
    _is_valid_operator(definition)
    _has_necessary_value(definition)
    queries = []
    annotations = {}
    for condition in definition["conditions"]:
        field = next(field for field in container_filter_fields if field.key == condition["field"])
        if field.annotation is not None:
            annotations[field.path] = field.annotation()
        operation = condition.get("op")
        value = condition.get("value")

        query = convert_to_q(field, operation, value)
        queries.append(query)

    results = (
        Container.objects.active()
        .annotate(**annotations)
        .filter(reduce(operator.and_, queries, Q()))
    )

    return results
