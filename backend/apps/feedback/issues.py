"""Builds and sends the public GitHub issue for a BugReport or Feedback row.

The repo is public, so issues only carry what the user deliberately typed
plus coarse context: the page (query string dropped — it can hold search
terms), app version, and the reporter's *role*, never their name. Console
logs, network failures, system info and crash stacks stay in Django admin;
the issue points there by report number.
"""

from urllib.parse import urlsplit

from django.utils import timezone

from . import github
from .models import BugReport, Feedback, GitHubIssueStatus

TITLE_MAX = 120


def _reporter(user) -> str:
    if user is None:
        return "Anonymous visitor"
    return user.get_role_display()


def _page(route: str) -> str:
    # The frontend sends a bare path ("/containers?search=..."), but rows
    # typed into admin may hold a full URL or "localhost:5173/..." — urlsplit
    # reads "localhost:" as a scheme there, so give it a "//" to find the host.
    if route and "://" not in route and not route.startswith("/"):
        route = "//" + route
    return urlsplit(route).path or "/"


def _title(prefix: str, text: str) -> str:
    text = " ".join(text.split())
    if len(text) > TITLE_MAX:
        text = text[: TITLE_MAX - 1] + "…"
    return f"[{prefix}] {text}"


def _bug_report_issue(report: BugReport) -> tuple[str, str, list[str]]:
    body = "\n".join(
        [
            f"**Impact:** {report.get_impact_display()}",
            f"**Page:** `{_page(report.route)}`",
            f"**App version:** `{report.app_version or 'unknown'}`",
            f"**Reported by:** {_reporter(report.user)}",
            "",
            "### What went wrong",
            report.summary,
            "",
            "### Details",
            report.description or "_No details given._",
            "",
            "---",
            f"Full diagnostics are in Django admin under **Bug report #{report.pk}**.",
            f"<!-- lab-manager:bug-report:{report.pk} -->",
        ]
    )
    labels = ["user-report", "bug", f"impact:{report.impact}"]
    return _title("Bug", report.summary), body, labels


def _feedback_issue(feedback: Feedback) -> tuple[str, str, list[str]]:
    body = "\n".join(
        [
            f"**Category:** {feedback.get_category_display()}",
            f"**Page:** `{_page(feedback.route)}`",
            f"**Reported by:** {_reporter(feedback.user)}",
            "",
            feedback.body,
            "",
            "---",
            f"Promoted from **Feedback #{feedback.pk}** in Django admin.",
            f"<!-- lab-manager:feedback:{feedback.pk} -->",
        ]
    )
    labels = ["user-report", "feedback", f"feedback:{feedback.category}"]
    first_line = feedback.body.strip().splitlines()[0] if feedback.body.strip() else ""
    return _title("Feedback", first_line or feedback.get_category_display()), body, labels


def build_issue(report: BugReport | Feedback) -> tuple[str, str, list[str]]:
    if isinstance(report, BugReport):
        return _bug_report_issue(report)
    return _feedback_issue(report)


def send_issue(report: BugReport | Feedback) -> None:
    """Create the GitHub issue for `report` and record the outcome on the row.

    Never raises for GitHub failures — the row is already saved, so a failure
    is recorded as github_status="failed" for `manage.py retry_github_issues`.
    A row that already has an issue is left alone, so retries can't duplicate.
    """
    if report.github_status == GitHubIssueStatus.CREATED:
        return
    title, body, labels = build_issue(report)
    try:
        issue = github.create_issue(title, body, labels)
    except github.GitHubError as e:
        report.github_status = GitHubIssueStatus.FAILED
        report.github_error = f"{timezone.now():%Y-%m-%d %H:%M} {e}"
    else:
        report.github_status = GitHubIssueStatus.CREATED
        report.github_issue_number = issue["number"]
        report.github_issue_url = issue["html_url"]
        report.github_error = ""
    report.save(
        update_fields=[
            "github_status",
            "github_issue_number",
            "github_issue_url",
            "github_error",
        ]
    )
