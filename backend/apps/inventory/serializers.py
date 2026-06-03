from rest_framework import serializers
from .models import ChemicalStorageCategories, Chemical, SDS, Location, Container, WeightReading, CheckoutEvent

class ChemicalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Chemical
        exclude = ["pubchem_cid", "synonyms"]

class ChemicalStorageCategoriesSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChemicalStorageCategories
        fields = "__all__"

class SDSSerializer(serializers.ModelSerializer):
    class Meta:
        model = SDS
        fields = ["file_name", "revision_date", "revision_number"]

class LocationSerializer(serializers.ModelSerializer):

    class Meta:
        model = Location
        fields = ["id", "type", "parent"]
    
    def to_representation(self, instance):
        self.fields['parent'] = LocationSerializer(many=False, read_only=True)
        return super().to_representation(instance)

class ContainerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Container
        fields = "__all__"

class WeightReadingSerializer(serializers.ModelSerializer):
    class Meta:
        model = WeightReading
        fields = ["id", "weight", "recorded_at"]

class CheckoutEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = CheckoutEvent
        exclude =["container"]