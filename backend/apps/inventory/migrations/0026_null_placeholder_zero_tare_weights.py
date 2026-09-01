# Data fix: the Notion migration (see scripts/onetime/import_notion_data.py)
# imported Container.tare_weight straight from Notion's own "Container
# Weight" formula field. Notion formulas default missing-input arithmetic to
# 0 rather than leaving the result blank, so any row whose "Initial Weight"
# was empty in Notion came across with tare_weight=0 — not a real
# measurement (no container weighs 0g empty), but a placeholder that
# has_estimated_usage/get_percent_remaining (see ContainerSerializer) treat
# as real data. Confirmed live: 52 containers were showing a computed but
# meaningless percent_remaining (as high as 876%) because of this.
#
# Nulls tare_weight back out wherever it's exactly 0 and there's no
# initial_weight to have derived it from, plus the one further row (a
# discarded container) where initial_weight was present but the same
# zero-tare pattern still doesn't reflect a real measurement.

from django.db import migrations
from django.db.models import Q


def null_placeholder_zero_tare_weights(apps, schema_editor):
    Container = apps.get_model("inventory", "container")
    Container.objects.filter(Q(tare_weight=0)).filter(
        Q(initial_weight__isnull=True) | Q(date_discarded__isnull=False)
    ).update(tare_weight=None)


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0025_backfill_location_barcodes"),
    ]

    operations = [
        # Not meaningfully reversible — reversing would mean reintroducing
        # the placeholder zeros this fixes.
        migrations.RunPython(null_placeholder_zero_tare_weights, migrations.RunPython.noop),
    ]
