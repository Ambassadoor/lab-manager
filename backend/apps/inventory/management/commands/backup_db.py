import os
import subprocess
from datetime import UTC, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.inventory.drive import DriveUploadError, trash_backups_older_than, upload_backup


# Backups are named in the machine's local time, so the 02:00 nightly run
# reads as 02:00 when browsing the folder. Not astimezone() with no argument:
# Django sets the process's TZ to TIME_ZONE (UTC) at startup, so that's UTC.
def _machine_timezone():
    try:
        with open("/etc/localtime", "rb") as f:
            return ZoneInfo.from_file(f)
    except OSError:
        return UTC


class Command(BaseCommand):
    help = (
        "Dump the database with pg_dump into BACKUP_DIR, prune dumps older than "
        "BACKUP_KEEP_DAYS, and (if BACKUP_DRIVE_FOLDER_ID is set) upload the dump "
        "to Google Drive with the same retention. Run nightly by a systemd timer."
    )

    def handle(self, *args, **options):
        db = settings.DATABASES["default"]
        backup_dir = Path(settings.BACKUP_DIR)
        backup_dir.mkdir(parents=True, exist_ok=True)

        now = timezone.now()
        name = f"{db['NAME']}-{now.astimezone(_machine_timezone()):%Y-%m-%d_%H%M}.dump"
        final = backup_dir / name
        # Written under a temporary name and renamed only once pg_dump
        # succeeds, so a failed run never leaves a truncated file that looks
        # like a good backup (and never gets uploaded or counted as one).
        partial = backup_dir / f"{name}.partial"

        result = subprocess.run(
            [
                "pg_dump",
                "--format=custom",
                f"--host={db['HOST']}",
                f"--port={db['PORT']}",
                f"--username={db['USER']}",
                f"--file={partial}",
                db["NAME"],
            ],
            env={**os.environ, "PGPASSWORD": db["PASSWORD"]},
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            partial.unlink(missing_ok=True)
            raise CommandError(f"pg_dump failed: {result.stderr.strip()}")
        partial.rename(final)
        self.stdout.write(f"Wrote {final} ({final.stat().st_size / 1024:.0f} KB)")

        cutoff = now - timedelta(days=settings.BACKUP_KEEP_DAYS)
        for old in backup_dir.glob(f"{db['NAME']}-*.dump"):
            if old.stat().st_mtime < cutoff.timestamp():
                old.unlink()
                self.stdout.write(f"Removed local {old.name}")

        if not settings.BACKUP_DRIVE_FOLDER_ID:
            self.stdout.write("BACKUP_DRIVE_FOLDER_ID not set — skipped Google Drive upload.")
            return

        # The local dump is already safe; a Drive failure still fails the run
        # (non-zero exit) so the systemd unit shows as failed and gets noticed.
        try:
            upload_backup(str(final), name)
            self.stdout.write(f"Uploaded {name} to Google Drive")
            # Drive's query syntax takes RFC 3339 without fractional seconds.
            trashed = trash_backups_older_than(cutoff.replace(microsecond=0))
            if trashed is None:
                self.stdout.write(
                    "Old Drive backups kept: the service account can't trash files in that "
                    "folder (needs Content manager, not Contributor)."
                )
            for old in trashed or []:
                self.stdout.write(f"Trashed old Drive backup {old}")
        except DriveUploadError as e:
            raise CommandError(str(e)) from e
