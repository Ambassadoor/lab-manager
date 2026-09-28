import json

from rest_framework import serializers

from .models import BugReport, Feedback

# The frontend caps its ring buffer well under this; the server-side cap is
# what actually protects the database from an oversized or hostile payload.
DIAGNOSTICS_MAX_BYTES = 256 * 1024

GITHUB_FIELDS = ["github_status", "github_issue_number", "github_issue_url"]


class BugReportCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = BugReport
        fields = [
            "id",
            "summary",
            "description",
            "impact",
            "route",
            "app_version",
            "diagnostics",
            *GITHUB_FIELDS,
        ]
        read_only_fields = ["id", *GITHUB_FIELDS]

    def validate_diagnostics(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Must be a JSON object.")
        if len(json.dumps(value).encode()) > DIAGNOSTICS_MAX_BYTES:
            raise serializers.ValidationError(
                f"Too large (limit {DIAGNOSTICS_MAX_BYTES // 1024} KB)."
            )
        return value


# Lab-manager view — includes the private diagnostics.
class BugReportSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True, default=None)

    class Meta:
        model = BugReport
        fields = [
            "id",
            "user",
            "username",
            "summary",
            "description",
            "impact",
            "route",
            "app_version",
            "diagnostics",
            "created_at",
            *GITHUB_FIELDS,
            "github_error",
        ]
        read_only_fields = fields


class FeedbackCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Feedback
        fields = ["id", "category", "route", "body", "may_contact"]
        read_only_fields = ["id"]


# Lab-manager view — only `status` is editable (triage).
class FeedbackSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True, default=None)

    class Meta:
        model = Feedback
        fields = [
            "id",
            "user",
            "username",
            "category",
            "route",
            "body",
            "may_contact",
            "status",
            "created_at",
            *GITHUB_FIELDS,
            "github_error",
        ]
        read_only_fields = [f for f in fields if f != "status"]
