# Generated to backfill Location.barcode with the LOC-<id> format now that
# it's decided (see Container.slug's 0023 migration for the same pattern).

from django.db import migrations
from django.db.models import Q


def add_barcodes_to_locations(apps, schema_editor):
    Location = apps.get_model("inventory", "location")
    unbarcoded = Location.objects.filter(Q(barcode__isnull=True) | Q(barcode__exact=""))
    for location in unbarcoded:
        location.barcode = f"LOC-{location.id}"
        location.save()


def reverse_add_barcodes_to_locations(apps, schema_editor):
    Location = apps.get_model("inventory", "location")
    for location in Location.objects.all():
        location.barcode = None
        location.save()


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0024_checkoutevent_related_event"),
    ]

    operations = [
        migrations.RunPython(add_barcodes_to_locations, reverse_add_barcodes_to_locations),
    ]
