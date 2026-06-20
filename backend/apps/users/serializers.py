from rest_framework import serializers
from .models import User
import re


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "role"]
        read_only_fields = ["id", "role"]

class NewUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "email",
            "lipscomb_id",
            "username",
            "first_name",
            "last_name",
            "password"
        ]

    def validate_email(self, value):
        email_regex = r'^[a-zA-Z0-9._%+-]+@(mail\.)?lipscomb\.edu$'
        match = re.match(email_regex, value)
        if match:
            return value
        else:
            raise serializers.ValidationError("You must use your lipscomb email address for account creation.")

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)