from django.conf import settings
from django.db import models


class GitHubIssueStatus(models.TextChoices):
    # Feedback starts here and only leaves it when a lab manager promotes it;
    # bug reports never use it (they always get an issue).
    NONE = "none", "Not sent"
    PENDING = "pending", "Pending"
    CREATED = "created", "Created"
    # Saved locally but the GitHub call failed (outage, bad credentials, or
    # not configured yet) — `manage.py retry_github_issues` picks these up.
    FAILED = "failed", "Failed"


class GitHubIssueFields(models.Model):
    """Tracks the public GitHub issue mirrored from a report.

    The repo is public, so the issue only carries what the user typed plus a
    few coarse facts (page, version, role). Everything captured automatically
    stays on the row here, visible in Django admin only.
    """

    github_status = models.CharField(
        max_length=10, choices=GitHubIssueStatus.choices, default=GitHubIssueStatus.NONE
    )
    github_issue_number = models.PositiveIntegerField(null=True, blank=True)
    github_issue_url = models.URLField(blank=True)
    github_error = models.TextField(blank=True)

    class Meta:
        abstract = True


class BugReport(GitHubIssueFields):
    class Impact(models.TextChoices):
        BLOCKING = "blocking", "I can't continue"
        ANNOYING = "annoying", "It's annoying but I can work around it"
        MINOR = "minor", "Minor / cosmetic"

    # Nullable — anonymous reports are allowed from the public pages (login,
    # SDS search/viewer).
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bug_reports",
    )
    summary = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    impact = models.CharField(max_length=10, choices=Impact.choices, default=Impact.ANNOYING)
    route = models.CharField(max_length=500, blank=True)
    app_version = models.CharField(max_length=64, blank=True)
    # Console output, network/API failures, navigation breadcrumbs, system
    # snapshot, and the crash itself when sent from the ErrorBoundary. Shape
    # is owned by the frontend's diagnostics module; only size is enforced here.
    diagnostics = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"#{self.pk} {self.summary}"


class Feedback(GitHubIssueFields):
    class Category(models.TextChoices):
        CONFUSING = "confusing", "Something was confusing"
        TEDIOUS = "tedious", "Something is slow or tedious"
        IDEA = "idea", "I have an idea"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        NEW = "new", "New"
        TRIAGED = "triaged", "Triaged"
        DONE = "done", "Done"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="feedback",
    )
    category = models.CharField(max_length=10, choices=Category.choices)
    route = models.CharField(max_length=500, blank=True)
    body = models.TextField()
    may_contact = models.BooleanField(default=False)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.NEW)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "feedback"

    def __str__(self) -> str:
        return f"#{self.pk} {self.get_category_display()}"
