from rest_framework import serializers


class QueryConditionSerializer(serializers.Serializer):
    field = serializers.CharField()
    op = serializers.CharField()
    value = serializers.JSONField(required=False, allow_null=True)


class QueryRequestSerializer(serializers.Serializer):
    conditions = QueryConditionSerializer(many=True)


class RegistryChoicesSerializer(serializers.Serializer):
    value = serializers.CharField()
    label = serializers.CharField()


class RegistryResponseSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    type = serializers.CharField()
    operations = serializers.ListField(child=serializers.CharField())
    choices = RegistryChoicesSerializer(many=True)
