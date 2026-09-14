from rest_framework import serializers

from ..models import LabelTemplate, LabelTemplateField


class LabelTemplateFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabelTemplateField
        fields = ["id", "role", "object_name"]


class LabelTemplateSerializer(serializers.ModelSerializer):
    fields = LabelTemplateFieldSerializer(many=True)

    class Meta:
        model = LabelTemplate
        fields = ["id", "name", "kind", "template_number", "media_width_mm", "fields"]

    # The model's (template, role) UniqueConstraint can't validate this on
    # its own — LabelTemplateFieldSerializer doesn't carry a `template`
    # field for DRF to check it against, so a duplicate role here would
    # otherwise surface as a raw IntegrityError from create()/update()
    # instead of a normal 400.
    def validate_fields(self, value):
        roles = [f["role"] for f in value]
        if len(roles) != len(set(roles)):
            raise serializers.ValidationError("Each role (barcode, text) can only appear once.")
        return value

    # `fields` is nested and writable — ModelSerializer doesn't support
    # nested writes on its own, so create/update handle it explicitly
    # (standard DRF pattern for a small inline one-to-many).
    def create(self, validated_data):
        fields_data = validated_data.pop("fields")
        template = LabelTemplate.objects.create(**validated_data)
        for field_data in fields_data:
            LabelTemplateField.objects.create(template=template, **field_data)
        return template

    def update(self, instance, validated_data):
        fields_data = validated_data.pop("fields", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if fields_data is not None:
            # Full replace rather than diffing — simplest correct approach
            # for the handful of rows (one per role) a template ever has,
            # all edited together through one form.
            instance.fields.all().delete()
            for field_data in fields_data:
                LabelTemplateField.objects.create(template=instance, **field_data)
        return instance
