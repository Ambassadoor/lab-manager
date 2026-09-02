from rest_framework import serializers
from .models import User
import re


LIPSCOMB_EMAIL_REGEX = r"^[a-zA-Z0-9._%+-]+@(mail\.)?lipscomb\.edu$"


def validate_lipscomb_email(value):
    """Shared by NewUserSerializer (registration) and UserSerializer (profile
    edits) — a user shouldn't be able to escape the domain restriction just
    by editing their email after the fact.
    """
    if not re.match(LIPSCOMB_EMAIL_REGEX, value):
        raise serializers.ValidationError("You must use your lipscomb email address.")
    return value


class UserSerializer(serializers.ModelSerializer):
    # get_role_display() (Django's auto-generated accessor for a `choices`
    # field) rather than duplicating Role's value->label mapping in the
    # frontend just to show "Lab Manager" instead of "lab_manager".
    role_display = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "lipscomb_id",
            "role",
            "role_display",
        ]
        read_only_fields = ["id", "role"]

    def validate_email(self, value):
        return validate_lipscomb_email(value)


# Returns users full name for display in checkout events
class UserCheckoutEventSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["full_name"]

    def get_full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}"


# Serializer to use for new account creation
class NewUserSerializer(serializers.ModelSerializer):
    # Explicit write_only — otherwise this serializer's declared "password"
    # field would auto-generate as readable, and (although it's only ever
    # used as a request-body serializer today) that would both leak the
    # password hash if this serializer were ever reused for a response and
    # mislead the generated OpenAPI schema into advertising it as returned.
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ["email", "lipscomb_id", "username", "first_name", "last_name", "password"]

    def validate_email(self, value):
        return validate_lipscomb_email(value)

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)
