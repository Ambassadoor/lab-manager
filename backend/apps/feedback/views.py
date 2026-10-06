from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from apps.users.models import User
from apps.users.permissions import role_at_least

from .issues import send_issue
from .models import BugReport, Feedback, GitHubIssueStatus
from .serializers import (
    BugReportCreateSerializer,
    BugReportSerializer,
    FeedbackCreateSerializer,
    FeedbackSerializer,
)
from .throttles import ReportAnonThrottle, ReportUserThrottle


class ReportViewMixin:
    """Create is open to anyone (throttled); everything else is lab-manager only.

    Same shape as SDSView: default authenticators stay in place so a logged-in
    reporter is still attached to their report, while AllowAny lets anonymous
    visitors on the public pages (login, SDS) submit too.
    """

    create_serializer_class = None

    def get_permissions(self):
        if self.action == "create":
            return [AllowAny()]
        return [role_at_least(User.Role.LAB_MANAGER)()]

    def get_throttles(self):
        if self.action == "create":
            return [ReportAnonThrottle(), ReportUserThrottle()]
        return super().get_throttles()

    def get_serializer_class(self):
        if self.action == "create":
            return self.create_serializer_class
        return self.serializer_class

    def _save_reporter(self, serializer, **extra):
        user = self.request.user if self.request.user.is_authenticated else None
        return serializer.save(user=user, **extra)

    @extend_schema(request=None)
    @action(detail=True, methods=["post"])
    def promote(self, request, pk=None):
        """Create (or retry) the GitHub issue for this row."""
        report = self.get_object()
        if report.github_status == GitHubIssueStatus.CREATED:
            return Response(
                {"detail": "This already has a GitHub issue."}, status=status.HTTP_400_BAD_REQUEST
            )
        send_issue(report)
        return Response(self.serializer_class(report).data)


class BugReportView(
    ReportViewMixin,
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    GenericViewSet,
):
    queryset = BugReport.objects.select_related("user")
    serializer_class = BugReportSerializer
    create_serializer_class = BugReportCreateSerializer
    filterset_fields = ["impact", "github_status"]

    def perform_create(self, serializer):
        # Anonymous reports don't auto-post: the repo is public, and an
        # unauthenticated endpoint that writes straight to it is a spam
        # channel. They're saved and a lab manager can promote them.
        if not self.request.user.is_authenticated:
            self._save_reporter(serializer, github_status=GitHubIssueStatus.NONE)
            return
        report = self._save_reporter(serializer, github_status=GitHubIssueStatus.PENDING)
        # After commit so a rolled-back save never leaves an orphan issue.
        transaction.on_commit(lambda: send_issue(report))


class FeedbackView(
    ReportViewMixin,
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    GenericViewSet,
):
    queryset = Feedback.objects.select_related("user")
    serializer_class = FeedbackSerializer
    create_serializer_class = FeedbackCreateSerializer
    filterset_fields = ["category", "status", "github_status"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def perform_create(self, serializer):
        # Feedback stays in the database until a lab manager promotes it.
        self._save_reporter(serializer)
