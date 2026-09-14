"""Reconcile Postgres with the live Notion inventory database.

Unlike import_notion_data.py (the original one-time seed), this does NOT
wipe and re-import — Notion has stayed the real system of record for
general inventory changes, but Postgres already holds real Chemical/
Container rows from that original import, so those are reused rather than
recreated:

- Chemical: reused as-is if a matching CAS already exists; only genuinely
  new chemicals (no matching CAS) get created. No mixture handling is
  expected to actually fire — no new mixtures were added to Notion since
  the original import — but the branch is kept for parity/safety.
- Container: matched by pk against Notion's own `unique_id` number (the
  same convention the original import used, since it's what's physically
  printed on each container's barcode label).
    - Existing container -> only `location` is checked/updated (via
      LOCATION_MAP below); nothing else about it is touched.
    - No existing container -> created fresh with everything Notion has,
      same shape as the original import.
- WeightReading: append-only, as everywhere else in this app. A new
  reading is only recorded when Notion's "Current Weight" differs from
  the container's own latest reading (or it has none yet).
- SDS: deduped by chemical + exact revision date/# (the same signal the
  live app's own suggestion list and pre-submit duplicate check use) —
  attaches the existing Drive file on a match, downloads-then-uploads on
  no match. GHS_PICTOGRAM_MAP translates Notion's multi_select option
  names to our GHSPictogram values ("None" intentionally maps to nothing).

Defaults to a dry run (prints what it would do, touches nothing). Pass
--commit to actually write.

Needs NOTION_SECRET and NOTION_DB_ID in the environment (same ones
import_notion_data.py used — this is the same Notion database, just with
SDS-related properties added to it since). Run with
`poetry run python scripts/onetime/reconcile_notion_data.py [--commit]`
from `backend/`.
"""

import os
import sys
import time
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django  # noqa: E402

django.setup()

from django.core.management.color import no_style  # noqa: E402
from django.db import connection, transaction  # noqa: E402

from apps.inventory.drive import DriveUploadError, upload_sds_file  # noqa: E402
from apps.inventory.models import (  # noqa: E402
    Chemical,
    ChemicalStorageCategories,
    Container,
    GHSPictogram,
    Location,
    SDS,
    WeightReading,
)
from apps.inventory.serializers.chemicals import _build_sds_filename  # noqa: E402

NOTION_SECRET = os.environ.get("NOTION_SECRET")
DB_ID = os.environ.get("NOTION_DB_ID")

# Weight readings created by this script are attributed to this user
# (ctpittman, Lab Manager) rather than a generic placeholder, since real
# accounts/roles exist now.
IMPORTED_BY_USER_ID = 2

# Notion's "Storage Location" select option name -> Location.pk. Confirmed
# against the live Postgres tree — see the conversation this script came
# out of for how the ambiguous ones (Side Room Cabinets, the two Acid
# Cabinet options) were resolved.
LOCATION_MAP = {
    "406": 4,
    "404 Fire Cabinet": 13,
    "415A": 6,
    "415 Fire Cabinet": 7,
    "415 Gray Fridge - Freezer": 15,
    "404 Side Room Cabinets": 18,
    "415A Acid Cabinet": 19,
    "415 Fridge": 14,
    "415 Acid Cabinet": 9,
}

# Notion's "GHS Pictographs" multi_select option name -> GHSPictogram value.
# "None" isn't a real pictogram — it maps to nothing (an empty list), not a
# stored value.
GHS_PICTOGRAM_MAP = {
    "Flammable": GHSPictogram.FLAMMABLE,
    "Oxidizer": GHSPictogram.OXIDIZING,
    "Compressed": GHSPictogram.COMPRESSED_GAS,
    "Corrosive": GHSPictogram.CORROSIVE,
    "Toxic": GHSPictogram.TOXIC,
    "Irritant": GHSPictogram.HARMFUL,
    "Health Hazard": GHSPictogram.HEALTH_HAZARD,
    "Explosive": GHSPictogram.EXPLOSIVE,
    "Environmental": GHSPictogram.ENVIRONMENT,
    "None": None,
}
assert all(v is None or v in GHSPictogram.values for v in GHS_PICTOGRAM_MAP.values())


class _FileLike:
    """Just enough of Django's UploadedFile interface for upload_sds_file —
    the file being uploaded here came from a `requests.get`, not a real
    multipart request."""

    def __init__(self, content: bytes, content_type: str):
        self._content = content
        self.content_type = content_type

    def read(self) -> bytes:
        return self._content


@dataclass
class Summary:
    containers_created: int = 0
    containers_updated_location: int = 0
    containers_unchanged: int = 0
    chemicals_created: int = 0
    weight_readings_created: int = 0
    sds_already_present: int = 0
    sds_attached_existing: int = 0
    sds_uploaded_new: int = 0
    sds_skipped_no_file: int = 0
    rows_skipped_errors: list = field(default_factory=list)


def request_with_retry(
    method: str, url: str, *, max_attempts: int = 5, **kwargs
) -> requests.Response:
    """requests.<method> with exponential backoff on 429/5xx — Notion,
    S3, and (indirectly, via upload_sds_file's own retry) Drive can all
    throttle transiently at this call volume, even though none of them are
    expected to hit a real quota ceiling at this scale."""
    for attempt in range(max_attempts):
        resp = requests.request(method, url, timeout=kwargs.pop("timeout", 60), **kwargs)
        if resp.status_code == 429 or resp.status_code >= 500:
            if attempt == max_attempts - 1:
                resp.raise_for_status()
            wait = float(resp.headers.get("Retry-After", 2**attempt))
            print(f"    ! {resp.status_code} from {url.split('?')[0]}, retrying in {wait:.0f}s")
            time.sleep(wait)
            continue
        resp.raise_for_status()
        return resp
    raise AssertionError("unreachable")  # pragma: no cover


# A generator, not a list — each row's Notion file property carries a
# pre-signed S3 URL good for only ~1 hour from the moment this query ran.
# Fetching every row up front (into one big list) before processing any of
# them risked rows near the end of an 800+-upload run having expired URLs
# by the time they're reached. Streaming page-by-page instead means a row
# is always downloaded within moments of its own URL being minted,
# regardless of how long the overall run takes.
def fetch_notion_rows():
    start_cursor = None
    while True:
        body = {"start_cursor": start_cursor} if start_cursor else {}
        r = request_with_retry(
            "POST",
            f"https://api.notion.com/v1/data_sources/{DB_ID}/query",
            headers={
                "Notion-Version": "2026-03-11",
                "Content-Type": "application/json",
                "Authorization": NOTION_SECRET,
            },
            json=body,
            timeout=30,
        ).json()
        yield from r["results"]
        if not r.get("has_more"):
            break
        start_cursor = r["next_cursor"]
        time.sleep(0.3)


def resolve_chemical(props: dict, summary: Summary, commit: bool) -> Chemical | None:
    cas_entries = props["CAS"]["rich_text"]
    name = props["Name"]["title"][0]["plain_text"]

    if not cas_entries:
        # No CAS in Notion at all — can't match or create by CAS. Fall back
        # to matching an existing chemical by name only; refuse to create a
        # brand-new nameless-CAS chemical from a script (that's exactly the
        # kind of judgment call a human should make, not silently guess at).
        chem = Chemical.objects.filter(name=name).first()
        if chem is None:
            raise ValueError(f"no CAS and no existing chemical named {name!r}")
        return chem

    cas_list = [s.strip() for s in cas_entries[0]["plain_text"].split(",")]
    if len(cas_list) == 1:
        chem = Chemical.objects.filter(cas=cas_list[0]).first()
        if chem is not None:
            return chem
        storage_category = None
        select = props["Group #"]["select"]
        if select:
            storage_category = ChemicalStorageCategories.objects.get(shorthand=select["name"])
        summary.chemicals_created += 1
        if not commit:
            return None
        return Chemical.objects.create(
            name=name, cas=cas_list[0], storage_category=storage_category
        )
    else:
        # Mixture — matched (never created; no new mixtures expected) by
        # name, same as the original import.
        chem = Chemical.objects.filter(name=name).first()
        if chem is None:
            raise ValueError(
                f"mixture {name!r} (CAS: {cas_list}) not found — expected to pre-exist"
            )
        return chem


def resolve_location(props: dict) -> Location:
    select = props["Storage Location"]["select"]
    if not select:
        raise ValueError("no Storage Location set")
    location_id = LOCATION_MAP.get(select["name"])
    if location_id is None:
        raise ValueError(f"unmapped Storage Location {select['name']!r}")
    return Location.objects.get(pk=location_id)


def reconcile_weight_reading(container: Container, props: dict, summary: Summary, commit: bool):
    notion_weight = props["Current Weight"]["number"]
    if not notion_weight:
        return
    notion_weight = Decimal(str(notion_weight))
    latest = container.readings.order_by("-recorded_at").first()
    if latest is not None and latest.weight == notion_weight:
        return
    summary.weight_readings_created += 1
    if commit:
        WeightReading.objects.create(
            container=container, weight=notion_weight, recorded_by_id=IMPORTED_BY_USER_ID
        )


# seen: (chemical_id, revision_date, revision_number) -> (drive_id, file_name)
# for every document already known about — populated lazily from the DB on
# first sight of a key, and updated as new/attached rows are processed, in
# BOTH dry-run and commit modes. Without this, a dry run could only ever
# see duplicates that already existed in Postgres before the run started —
# it can't write anything, so it has no way to notice that row #50 in this
# same run duplicates row #12's document unless something tracks that
# in-memory as the run goes. Threading the same cache through commit mode
# too (rather than only building it there) means both modes make identical
# decisions — a dry run's preview is what --commit will actually do.
SdsCache = dict[tuple[int, str | None, str | None], tuple[str, str]]


def reconcile_sds(
    container: Container,
    chemical: Chemical,
    props: dict,
    summary: Summary,
    commit: bool,
    seen: SdsCache,
):
    files = props["Safety Data Sheet"]["files"]
    if not files:
        summary.sds_skipped_no_file += 1
        return

    date_val = props["SDS Revision Date"]["date"]
    revision_date = date_val["start"] if date_val else None

    # Kept as text, not parsed as an int — real revision labels in this data
    # aren't always plain integers (e.g. "6.7", "8.2" decimal versioning),
    # which is exactly why SDS.revision_number is a CharField now.
    version_text = props["SDS Version #"]["rich_text"]
    revision_number = version_text[0]["plain_text"].strip() if version_text else None

    pictograms = [
        GHS_PICTOGRAM_MAP[opt["name"]]
        for opt in props["GHS Pictographs"]["multi_select"]
        if GHS_PICTOGRAM_MAP.get(opt["name"]) is not None
    ]

    # Idempotency: if this exact container already has this exact document
    # (from a prior run of this script, or from manual entry through the
    # app), there's nothing to do — without this check, re-running the
    # script would re-attach/re-upload on every single already-handled row,
    # every time (the cross-container dedup below only ever finds *other*
    # containers' matches, it was never checking this one's own).
    already_has_it = container.sds.filter(
        revision_date=revision_date, revision_number=revision_number
    ).exists()
    if already_has_it:
        summary.sds_already_present += 1
        return

    # Only a safe "same document" signal when both revision fields are
    # present — matches the live app's own pre-submit duplicate check
    # (SdsUploadDialog.onSubmit).
    key = (
        (chemical.id, revision_date, revision_number) if revision_date and revision_number else None
    )
    match = seen.get(key) if key is not None else None
    if match is None and key is not None:
        db_match = SDS.objects.filter(
            container__chemical=chemical,
            revision_date=revision_date,
            revision_number=revision_number,
        ).first()
        if db_match is not None:
            match = (db_match.drive_id, db_match.file_name)
            seen[key] = match

    if match is not None:
        drive_id, file_name = match
        summary.sds_attached_existing += 1
        if commit:
            SDS.objects.create(
                container=container,
                file_name=file_name,
                drive_id=drive_id,
                revision_date=revision_date,
                revision_number=revision_number,
                ghs_pictograms=pictograms,
            )
        return

    summary.sds_uploaded_new += 1
    if not commit:
        # Register as "would exist" so a later row in this same dry run that
        # duplicates this one is correctly previewed as an attach, not
        # another upload.
        if key is not None:
            seen[key] = ("(dry-run)", "(dry-run)")
        return
    resp = request_with_retry("GET", files[0]["file"]["url"], timeout=120)
    filename = _build_sds_filename(container, revision_date, revision_number)
    drive_id = None
    max_attempts = 3
    for attempt in range(max_attempts):
        try:
            drive_id = upload_sds_file(_FileLike(resp.content, "application/pdf"), filename)
            break
        except DriveUploadError as e:
            if attempt == max_attempts - 1:
                raise ValueError(f"Drive upload failed: {e}") from e
            wait = 2**attempt
            print(f"    ! Drive upload failed ({e}), retrying in {wait}s")
            time.sleep(wait)
    SDS.objects.create(
        container=container,
        file_name=filename,
        drive_id=drive_id,
        revision_date=revision_date,
        revision_number=revision_number,
        ghs_pictograms=pictograms,
    )
    if key is not None:
        seen[key] = (drive_id, filename)


def process_row(row: dict, summary: Summary, commit: bool, seen: SdsCache):
    props = row["properties"]
    notion_id = props["ID"]["unique_id"]["number"]
    label = f"CHEM-{notion_id}"

    location = resolve_location(props)

    container = Container.objects.filter(pk=notion_id).first()
    if container is None:
        chemical = resolve_chemical(props, summary, commit)
        m = props["Company"]["rich_text"]
        pn = props["Product #"]["rich_text"]
        q = props["Unit of Measurement"]["select"]
        dr_val = props["Date Received"]["date"]
        do_val = props["Date Opened"]["date"]
        discarded = props["Status"]["status"]["name"] == "Discarded"
        last_edited = row["last_edited_time"].split("T")[0]
        iw = props["Initial Weight (g)"]["number"]
        tw = props["Container Weight"]["formula"]["number"]

        print(f"  [{label}] CREATE container (chemical={chemical})")
        summary.containers_created += 1
        if commit:
            container = Container.objects.create(
                pk=notion_id,
                slug=f"chem-{notion_id}",
                name=props["Name"]["title"][0]["plain_text"],
                chemical=chemical,
                location=location,
                manufacturer=m[0]["plain_text"] if m else None,
                initial_quantity=props["Max Volume/Mass"]["number"] or None,
                quantity_unit=q["name"] if q else None,
                product_num=pn[0]["plain_text"] if pn else None,
                date_received=dr_val["start"] if dr_val else None,
                date_opened=do_val["start"] if do_val else None,
                date_discarded=last_edited if discarded else None,
                density=props["Density/Specific Gravity (g/mL)"]["number"] or None,
                initial_weight=Decimal(str(iw)) if iw is not None else None,
                tare_weight=Decimal(str(tw)) if tw is not None else None,
            )
        else:
            # Dry run: SDS/WeightReading reconciliation below needs a real
            # container to attach to — nothing was actually created, so
            # there's nothing further to check for this row this pass.
            return
    else:
        chemical = container.chemical
        if container.location_id != location.id:
            print(f"  [{label}] UPDATE location: {container.location_id} -> {location.id}")
            summary.containers_updated_location += 1
            if commit:
                container.location = location
                container.save(update_fields=["location"])
        else:
            summary.containers_unchanged += 1

    reconcile_weight_reading(container, props, summary, commit)
    reconcile_sds(container, chemical, props, summary, commit, seen)


# Newly-created containers here use an explicit pk (Notion's own id) rather
# than the auto-increment sequence, which never advances to account for
# rows it didn't hand out itself — without this, the very next *normal*
# Container.objects.create() (through the app, no explicit pk) could try to
# reuse an id one of these rows already took.
def reset_container_sequence():
    statements = connection.ops.sequence_reset_sql(no_style(), [Container])
    if not statements:
        return
    with connection.cursor() as cursor:
        for stmt in statements:
            cursor.execute(stmt)


def run(commit: bool):
    summary = Summary()
    seen: SdsCache = {}
    row_count = 0

    for row in fetch_notion_rows():
        row_count += 1
        props = row["properties"]
        label = f"CHEM-{props['ID']['unique_id']['number']}"
        try:
            with transaction.atomic():
                process_row(row, summary, commit, seen)
        except Exception as e:  # noqa: BLE001 — one bad row shouldn't stop the run
            print(f"  [{label}] SKIPPED: {e}")
            summary.rows_skipped_errors.append((label, str(e)))

    print(f"\nProcessed {row_count} rows from Notion.")

    if commit and summary.containers_created:
        reset_container_sequence()

    print("\n--- Summary" + (" (DRY RUN — nothing written)" if not commit else "") + " ---")
    print(f"Containers created:            {summary.containers_created}")
    print(f"Containers with location fix:  {summary.containers_updated_location}")
    print(f"Containers unchanged:          {summary.containers_unchanged}")
    print(f"Chemicals created:             {summary.chemicals_created}")
    print(f"Weight readings recorded:      {summary.weight_readings_created}")
    print(f"SDS attached (existing file):  {summary.sds_attached_existing}")
    print(f"SDS uploaded (new file):       {summary.sds_uploaded_new}")
    print(f"SDS already present (no-op):   {summary.sds_already_present}")
    print(f"SDS skipped (no file/row):     {summary.sds_skipped_no_file}")
    if summary.rows_skipped_errors:
        print(f"\nRows skipped due to errors: {len(summary.rows_skipped_errors)}")
        for label, err in summary.rows_skipped_errors:
            print(f"  {label}: {err}")


if __name__ == "__main__":
    run(commit="--commit" in sys.argv)
