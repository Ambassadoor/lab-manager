"""GitHub App client for mirroring user reports as issues.

Auth is a two-step GitHub App flow: sign a short-lived JWT with the app's
private key, then trade it for an installation access token (valid ~1 hour)
scoped to the one repo the app is installed on. The installation token is
cached so a burst of reports doesn't mint a new one each time.

Needs GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, GITHUB_APP_PRIVATE_KEY_FILE
and GITHUB_REPO (see .env.example and docs/Bug-Reporting-Plan.md for the app
setup). Until they're set, every call raises GitHubError and reports are
saved with github_status="failed" for a later retry.
"""

import time
from pathlib import Path

import jwt
import requests
from django.conf import settings
from django.core.cache import cache

API_URL = "https://api.github.com"
TIMEOUT_SECONDS = 10
TOKEN_CACHE_KEY = "feedback:github-installation-token"
# Installation tokens last an hour; refresh well before that.
TOKEN_CACHE_SECONDS = 50 * 60


class GitHubError(Exception):
    """Raised when an issue can't be created on GitHub."""


def _headers(token: str) -> dict[str, str]:
    return {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _app_jwt() -> str:
    try:
        private_key = Path(settings.GITHUB_APP_PRIVATE_KEY_FILE).read_text()
    except OSError as e:
        raise GitHubError(f"Couldn't read the GitHub App private key: {e}") from e
    now = int(time.time())
    # iat is backdated a minute to tolerate clock drift; GitHub caps exp at 10 min.
    payload = {"iat": now - 60, "exp": now + 9 * 60, "iss": str(settings.GITHUB_APP_ID)}
    return jwt.encode(payload, private_key, algorithm="RS256")


def _installation_token() -> str:
    token = cache.get(TOKEN_CACHE_KEY)
    if token:
        return token
    url = f"{API_URL}/app/installations/{settings.GITHUB_APP_INSTALLATION_ID}/access_tokens"
    try:
        response = requests.post(url, headers=_headers(_app_jwt()), timeout=TIMEOUT_SECONDS)
    except requests.RequestException as e:
        raise GitHubError(f"Couldn't reach GitHub: {e}") from e
    if response.status_code != 201:
        raise GitHubError(
            f"GitHub refused the installation token ({response.status_code}): {response.text}"
        )
    token = response.json()["token"]
    cache.set(TOKEN_CACHE_KEY, token, TOKEN_CACHE_SECONDS)
    return token


def is_configured() -> bool:
    return all(
        [
            settings.GITHUB_APP_ID,
            settings.GITHUB_APP_INSTALLATION_ID,
            settings.GITHUB_APP_PRIVATE_KEY_FILE,
            settings.GITHUB_REPO,
        ]
    )


def create_issue(title: str, body: str, labels: list[str]) -> dict:
    """Create an issue on GITHUB_REPO; returns GitHub's issue JSON."""
    if not is_configured():
        raise GitHubError(
            "GitHub isn't configured — set GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, "
            "GITHUB_APP_PRIVATE_KEY_FILE and GITHUB_REPO (see .env.example)."
        )
    url = f"{API_URL}/repos/{settings.GITHUB_REPO}/issues"
    payload = {"title": title, "body": body, "labels": labels}
    try:
        response = requests.post(
            url,
            json=payload,
            headers=_headers(_installation_token()),
            timeout=TIMEOUT_SECONDS,
        )
    except requests.RequestException as e:
        raise GitHubError(f"Couldn't reach GitHub: {e}") from e
    if response.status_code == 401:
        # Cached token revoked or expired early — drop it so the next attempt re-mints.
        cache.delete(TOKEN_CACHE_KEY)
    if response.status_code != 201:
        raise GitHubError(f"GitHub rejected the issue ({response.status_code}): {response.text}")
    return response.json()
