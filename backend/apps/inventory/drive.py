"""Google Drive integration for SDS file storage.

SDS documents are uploaded to a single shared Drive folder (SDS_DRIVE_FOLDER_ID,
a folder inside a *shared drive* — a service account has no personal storage
quota of its own, so a regular My Drive folder won't accept uploads from it)
via a service account (GOOGLE_SERVICE_ACCOUNT_FILE). Neither is set up in
every environment — see .env.example and the SDS feature plan for the manual
setup this depends on (create the Cloud project/service account, create a
shared drive, share it with the service account). Until then, any call here
raises DriveUploadError.
"""

from django.conf import settings
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaInMemoryUpload

SCOPES = ["https://www.googleapis.com/auth/drive"]


class DriveUploadError(Exception):
    """Raised when a file can't be uploaded to (or shared on) Drive."""


def _get_client():
    if not settings.GOOGLE_SERVICE_ACCOUNT_FILE or not settings.SDS_DRIVE_FOLDER_ID:
        raise DriveUploadError(
            "Google Drive isn't configured — set GOOGLE_SERVICE_ACCOUNT_FILE and "
            "SDS_DRIVE_FOLDER_ID (see .env.example)."
        )
    try:
        credentials = service_account.Credentials.from_service_account_file(
            settings.GOOGLE_SERVICE_ACCOUNT_FILE, scopes=SCOPES
        )
    except (OSError, ValueError) as e:
        raise DriveUploadError(f"Couldn't load Google service account credentials: {e}") from e
    return build("drive", "v3", credentials=credentials, cache_discovery=False)


# Uploads `file` (a Django UploadedFile) to the configured Drive folder, shares
# it publicly (anyone with the link can view — SDS documents are public safety
# information, not access-controlled, matching public/unauthenticated SDS
# viewing elsewhere in this app), and returns the new file's Drive id.
def upload_sds_file(file, filename: str) -> str:
    client = _get_client()
    media = MediaInMemoryUpload(file.read(), mimetype=file.content_type or "application/pdf")
    try:
        created = (
            client.files()
            .create(
                body={"name": filename, "parents": [settings.SDS_DRIVE_FOLDER_ID]},
                media_body=media,
                fields="id",
                # Required whenever the target folder lives in a shared
                # drive (the only kind of Drive storage a service account
                # can actually write to — service accounts have no personal
                # storage quota of their own) — omitting it makes the API
                # unable to resolve a shared-drive parent at all.
                supportsAllDrives=True,
            )
            .execute()
        )
        drive_id = created["id"]
        client.permissions().create(
            fileId=drive_id,
            body={"role": "reader", "type": "anyone"},
            supportsAllDrives=True,
        ).execute()
    except HttpError as e:
        raise DriveUploadError(f"Failed to upload file to Google Drive: {e}") from e
    return drive_id
