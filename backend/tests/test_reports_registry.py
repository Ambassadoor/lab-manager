import pytest

from apps.inventory.models import Container
from apps.reports.registry import return_registry, _check_registry, type_operations, Field, FieldTypes

class TestRegistry:
    def test_tare_weight_formatted_correctly(self):
        registry_data = return_registry()

        tare_weight = next((field for field in registry_data if field['key'] == "tare_weight"), None)
        assert tare_weight is not None
        assert tare_weight['type'] == 'number'

        operations = ["eq", "lt", "lte", "gt", "gte", "is_empty", "is_not_empty"]
        assert tare_weight['operations'] == operations


    def test_unit_field_choices_match_container_model(self):
        registry_data = return_registry()
        choices = Container.QUANTITY_UNIT_CHOICES
        unit = next((field for field in registry_data if field["key"] == "unit"), None)
        assert unit is not None
        assert "choices" in unit
        assert unit['choices'] == choices

    def test_registry_rejects_duplicate_keys(self):

        container_name = Field(
            key="name",
            label="Name",
            type=FieldTypes.TEXT,
            nullable=False,
            path="name",
        )

        container_manufacturer = Field(
            key="name",
            label="Manufacturer",
            type=FieldTypes.TEXT,
            nullable=True,
            path="manufacturer",
        )
        with pytest.raises(ValueError, match=r"['name']"):
            _check_registry([container_name, container_manufacturer], type_operations)
