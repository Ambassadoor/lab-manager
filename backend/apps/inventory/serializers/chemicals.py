from rest_framework import serializers

from ..models import Chemical, ChemicalStorageCategories, Ingredient, SDS


class ChemicalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Chemical
        exclude = ["pubchem_cid", "synonyms"]
        depth = 1

    # Handles the self-reference
    def to_representation(self, instance):
        self.fields["ingredients"] = IngredientSerializer(many=True, read_only=True)
        return super().to_representation(instance)


class ChemicalWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Chemical
        fields = ["name", "cas", "formula", "molecular_weight", "storage_category"]


class ChemicalStorageCategoriesSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChemicalStorageCategories
        fields = "__all__"


class SDSSerializer(serializers.ModelSerializer):
    class Meta:
        model = SDS
        fields = ["file_name", "revision_date", "revision_number"]


class IngredientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ingredient
        fields = ["mixture", "ingredient"]
