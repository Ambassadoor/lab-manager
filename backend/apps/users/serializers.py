from rest_framework import serializers
from .models import User
import re


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "role"]
        read_only_fields = ["id", "role"]


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
        email_regex = r"^[a-zA-Z0-9._%+-]+@(mail\.)?lipscomb\.edu$"
        match = re.match(email_regex, value)
        if match:
            return value
        else:
            raise serializers.ValidationError(
                "You must use your lipscomb email address for account creation."
            )

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)
