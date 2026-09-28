from unittest.mock import patch

import pytest
import requests
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.core.cache import cache
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.feedback import github
from apps.feedback.issues import build_issue
from apps.feedback.models import BugReport, Feedback, GitHubIssueStatus
from apps.users.models import User

REPORTS_URL = "/api/feedback/reports/"
FEEDBACK_URL = "/api/feedback/general/"
FAKE_ISSUE = {"number": 7, "html_url": "https://github.com/Ambassadoor/lab-manager/issues/7"}


@pytest.fixture(autouse=True)
def clear_cache():
    # Throttle counters and the installation token both live in the cache.
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def create_issue():
    with patch("apps.feedback.issues.github.create_issue", return_value=FAKE_ISSUE) as mock:
        yield mock


def report_payload(**overrides):
    payload = {
        "summary": "Weigh-in button does nothing",
        "description": "Clicked save, nothing happened.",
        "impact": "blocking",
        "route": "/containers?search=secret-acid",
        "app_version": "abc1234",
        "diagnostics": {"console": [{"level": "error", "message": "PRIVATE-CONSOLE-LINE"}]},
    }
    payload.update(overrides)
    return payload


@pytest.mark.django_db
class TestBugReportCreate:
    def test_logged_in_report_creates_issue(
        self, client_as, create_issue, django_capture_on_commit_callbacks
    ):
        client = client_as(User.Role.LAB_ASSISTANT)
        with django_capture_on_commit_callbacks(execute=True):
            response = client.post(REPORTS_URL, report_payload(), format="json")
        assert response.status_code == 201

        report = BugReport.objects.get()
        assert report.user.username == "user-lab_assistant"
        assert report.github_status == GitHubIssueStatus.CREATED
        assert report.github_issue_number == 7
        assert report.github_issue_url == FAKE_ISSUE["html_url"]
        title, _body, labels = create_issue.call_args.args
        assert title == "[Bug] Weigh-in button does nothing"
        assert labels == ["user-report", "bug", "impact:blocking"]

    def test_github_failure_still_saves_report(self, client_as, django_capture_on_commit_callbacks):
        client = client_as(User.Role.LAB_ASSISTANT)
        with (
            patch(
                "apps.feedback.issues.github.create_issue",
                side_effect=github.GitHubError("GitHub is down"),
            ),
            django_capture_on_commit_callbacks(execute=True),
        ):
            response = client.post(REPORTS_URL, report_payload(), format="json")
        assert response.status_code == 201

        report = BugReport.objects.get()
        assert report.github_status == GitHubIssueStatus.FAILED
        assert "GitHub is down" in report.github_error

    def test_anonymous_report_is_saved_but_not_sent(
        self, create_issue, django_capture_on_commit_callbacks
    ):
        with django_capture_on_commit_callbacks(execute=True):
            response = APIClient().post(REPORTS_URL, report_payload(), format="json")
        assert response.status_code == 201

        report = BugReport.objects.get()
        assert report.user is None
        assert report.github_status == GitHubIssueStatus.NONE
        create_issue.assert_not_called()

    def test_diagnostics_must_be_an_object(self):
        response = APIClient().post(
            REPORTS_URL, report_payload(diagnostics=["not", "a", "dict"]), format="json"
        )
        assert response.status_code == 400
        assert "diagnostics" in response.json()

    def test_oversized_diagnostics_rejected(self):
        huge = {"console": ["x" * 1024] * 300}
        response = APIClient().post(REPORTS_URL, report_payload(diagnostics=huge), format="json")
        assert response.status_code == 400
        assert "diagnostics" in response.json()

    def test_anonymous_submissions_are_throttled(self):
        client = APIClient()
        statuses = [
            client.post(REPORTS_URL, report_payload(), format="json").status_code for _ in range(6)
        ]
        assert statuses == [201] * 5 + [429]


@pytest.mark.django_db
class TestPublicIssueContent:
    def test_issue_body_omits_private_diagnostics(self, client_as):
        user = User.objects.create_user(
            username="jdoe", email="jdoe@lipscomb.edu", password="pw", role="stockroom"
        )
        report = BugReport.objects.create(user=user, **report_payload())
        _title, body, _labels = build_issue(report)

        assert "PRIVATE-CONSOLE-LINE" not in body
        assert "secret-acid" not in body  # query string dropped
        assert "`/containers`" in body
        assert "jdoe" not in body  # role, not name
        assert "Stockroom Worker" in body
        assert f"Bug report #{report.pk}" in body

    def test_long_summary_is_truncated_in_title(self):
        report = BugReport.objects.create(**report_payload(summary="a" * 200))
        title, _body, _labels = build_issue(report)
        assert len(title) <= len("[Bug] ") + 120

    @pytest.mark.parametrize(
        "route, page",
        [
            ("/containers?search=x", "/containers"),
            ("localhost:5173/containers/4?tab=sds", "/containers/4"),
            ("http://localhost:5173/sds", "/sds"),
            ("localhost:5173", "/"),
            ("", "/"),
        ],
    )
    def test_page_is_path_only(self, route, page):
        report = BugReport.objects.create(**report_payload(route=route))
        _title, body, _labels = build_issue(report)
        assert f"**Page:** `{page}`" in body


@pytest.mark.django_db
class TestManagerAccess:
    @pytest.mark.parametrize("url", [REPORTS_URL, FEEDBACK_URL])
    def test_list_denied_to_anonymous_and_below_lab_manager(self, client_as, url):
        assert APIClient().get(url).status_code == 403
        assert client_as(User.Role.FACULTY).get(url).status_code == 403

    def test_lab_manager_sees_diagnostics(self, client_as):
        BugReport.objects.create(**report_payload())
        response = client_as(User.Role.LAB_MANAGER).get(REPORTS_URL)
        assert response.status_code == 200
        assert response.json()[0]["diagnostics"]["console"][0]["message"] == (
            "PRIVATE-CONSOLE-LINE"
        )

    def test_lab_manager_can_promote_anonymous_report(self, client_as, create_issue):
        report = BugReport.objects.create(**report_payload())
        response = client_as(User.Role.LAB_MANAGER).post(f"{REPORTS_URL}{report.pk}/promote/")
        assert response.status_code == 200
        assert response.json()["github_issue_number"] == 7

    def test_promote_twice_rejected(self, client_as, create_issue):
        report = BugReport.objects.create(
            **report_payload(), github_status=GitHubIssueStatus.CREATED
        )
        response = client_as(User.Role.LAB_MANAGER).post(f"{REPORTS_URL}{report.pk}/promote/")
        assert response.status_code == 400
        create_issue.assert_not_called()


@pytest.mark.django_db
class TestFeedback:
    def feedback_payload(self):
        return {
            "category": "confusing",
            "route": "/locations",
            "body": "Not sure how to move a shelf.\nMore detail here.",
            "may_contact": True,
        }

    def test_feedback_is_stored_not_sent(self, client_as, create_issue):
        response = client_as(User.Role.LAB_ASSISTANT).post(
            FEEDBACK_URL, self.feedback_payload(), format="json"
        )
        assert response.status_code == 201
        feedback = Feedback.objects.get()
        assert feedback.status == Feedback.Status.NEW
        assert feedback.github_status == GitHubIssueStatus.NONE
        create_issue.assert_not_called()

    def test_anonymous_feedback_allowed(self):
        response = APIClient().post(FEEDBACK_URL, self.feedback_payload(), format="json")
        assert response.status_code == 201
        assert Feedback.objects.get().user is None

    def test_promote_feedback(self, client_as, create_issue):
        feedback = Feedback.objects.create(**self.feedback_payload())
        client = client_as(User.Role.LAB_MANAGER)
        response = client.post(f"{FEEDBACK_URL}{feedback.pk}/promote/")
        assert response.status_code == 200
        title, _body, labels = create_issue.call_args.args
        assert title == "[Feedback] Not sure how to move a shelf."
        assert labels == ["user-report", "feedback", "feedback:confusing"]

    def test_promote_denied_below_lab_manager(self, client_as, create_issue):
        feedback = Feedback.objects.create(**self.feedback_payload())
        client = client_as(User.Role.COORDINATOR)
        assert client.post(f"{FEEDBACK_URL}{feedback.pk}/promote/").status_code == 403
        create_issue.assert_not_called()

    def test_lab_manager_can_only_change_status(self, client_as):
        feedback = Feedback.objects.create(**self.feedback_payload())
        response = client_as(User.Role.LAB_MANAGER).patch(
            f"{FEEDBACK_URL}{feedback.pk}/",
            {"status": "triaged", "body": "tampered"},
            format="json",
        )
        assert response.status_code == 200
        feedback.refresh_from_db()
        assert feedback.status == Feedback.Status.TRIAGED
        assert feedback.body.startswith("Not sure")


@pytest.mark.django_db
def test_retry_command_resends_failed_reports(create_issue):
    failed = BugReport.objects.create(**report_payload(), github_status=GitHubIssueStatus.FAILED)
    untouched = BugReport.objects.create(**report_payload())  # status NONE (anonymous)
    call_command("retry_github_issues")

    failed.refresh_from_db()
    untouched.refresh_from_db()
    assert failed.github_status == GitHubIssueStatus.CREATED
    assert untouched.github_status == GitHubIssueStatus.NONE
    assert create_issue.call_count == 1


class FakeResponse:
    def __init__(self, status_code, data):
        self.status_code = status_code
        self._data = data
        self.text = str(data)

    def json(self):
        return self._data


@pytest.fixture
def github_app(settings, tmp_path):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = tmp_path / "app.pem"
    pem.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    settings.GITHUB_APP_ID = "123"
    settings.GITHUB_APP_INSTALLATION_ID = "456"
    settings.GITHUB_APP_PRIVATE_KEY_FILE = str(pem)
    settings.GITHUB_REPO = "Ambassadoor/lab-manager"


class TestGitHubClient:
    def test_unconfigured_raises(self, settings):
        settings.GITHUB_APP_ID = None
        with pytest.raises(github.GitHubError, match="isn't configured"):
            github.create_issue("t", "b", [])

    def test_mints_and_caches_installation_token(self, github_app):
        responses = [
            FakeResponse(201, {"token": "inst-token"}),
            FakeResponse(201, FAKE_ISSUE),
            FakeResponse(201, FAKE_ISSUE),
        ]
        with patch("apps.feedback.github.requests.post", side_effect=responses) as post:
            github.create_issue("t", "b", ["bug"])
            github.create_issue("t", "b", ["bug"])

        urls = [call.args[0] for call in post.call_args_list]
        assert urls == [
            "https://api.github.com/app/installations/456/access_tokens",
            "https://api.github.com/repos/Ambassadoor/lab-manager/issues",
            "https://api.github.com/repos/Ambassadoor/lab-manager/issues",
        ]
        assert post.call_args.kwargs["headers"]["Authorization"] == "Bearer inst-token"

    def test_network_error_becomes_github_error(self, github_app):
        with patch(
            "apps.feedback.github.requests.post", side_effect=requests.ConnectionError("boom")
        ):
            with pytest.raises(github.GitHubError, match="Couldn't reach GitHub"):
                github.create_issue("t", "b", [])
