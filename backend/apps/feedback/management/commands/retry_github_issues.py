from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from apps.feedback.issues import send_issue
from apps.feedback.models import BugReport, Feedback, GitHubIssueStatus

# A "pending" row normally flips within seconds of being saved; one still
# pending after this long means the process died mid-send.
STALE_PENDING = timedelta(minutes=10)


class Command(BaseCommand):
    help = "Retry GitHub issue creation for reports that failed (or got stuck pending)."

    def handle(self, *args, **options):
        cutoff = timezone.now() - STALE_PENDING
        needs_retry = Q(github_status=GitHubIssueStatus.FAILED) | Q(
            github_status=GitHubIssueStatus.PENDING, created_at__lt=cutoff
        )
        for model in (BugReport, Feedback):
            for report in model.objects.filter(needs_retry):
                send_issue(report)
                outcome = report.github_issue_url or f"failed: {report.github_error}"
                self.stdout.write(f"{model.__name__} #{report.pk}: {outcome}")
