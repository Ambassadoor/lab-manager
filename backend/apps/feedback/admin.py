import json

from django.contrib import admin, messages
from django.utils.html import format_html

from .issues import send_issue
from .models import BugReport, Feedback, GitHubIssueStatus

# Django admin is where the full, private diagnostics live — the public
# GitHub issue only links back here by report number.


def _issue_link(obj):
    if not obj.github_issue_url:
        return obj.get_github_status_display()
    return format_html(
        '<a href="{}" target="_blank">#{}</a>', obj.github_issue_url, obj.github_issue_number
    )


_issue_link.short_description = "GitHub issue"


@admin.action(description="Create / retry GitHub issue")
def send_to_github(modeladmin, request, queryset):
    sent = failed = 0
    for report in queryset.exclude(github_status=GitHubIssueStatus.CREATED):
        send_issue(report)
        if report.github_status == GitHubIssueStatus.CREATED:
            sent += 1
        else:
            failed += 1
    if sent:
        modeladmin.message_user(request, f"Created {sent} GitHub issue(s).", messages.SUCCESS)
    if failed:
        modeladmin.message_user(
            request, f"{failed} failed — see the GitHub error field.", messages.ERROR
        )


class ReportAdmin(admin.ModelAdmin):
    actions = [send_to_github]
    date_hierarchy = "created_at"
    readonly_fields = [
        "user",
        "created_at",
        "github_status",
        "github_issue_number",
        "github_issue_url",
        "github_error",
    ]


@admin.register(BugReport)
class BugReportAdmin(ReportAdmin):
    list_display = ["id", "summary", "impact", "user", "route", "created_at", _issue_link]
    list_filter = ["impact", "github_status"]
    search_fields = ["summary", "description", "route"]
    readonly_fields = [*ReportAdmin.readonly_fields, "app_version", "pretty_diagnostics"]
    exclude = ["diagnostics"]

    @admin.display(description="Diagnostics")
    def pretty_diagnostics(self, obj):
        return format_html(
            '<pre style="white-space: pre-wrap; max-height: 40em; overflow: auto">{}</pre>',
            json.dumps(obj.diagnostics, indent=2),
        )


@admin.register(Feedback)
class FeedbackAdmin(ReportAdmin):
    list_display = ["id", "category", "status", "user", "route", "created_at", _issue_link]
    list_filter = ["category", "status", "github_status", "may_contact"]
    list_editable = ["status"]
    search_fields = ["body", "route"]
