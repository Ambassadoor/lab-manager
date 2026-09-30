# Pre-existing drift between models.py and migration history, unrelated to
# the SDS feature this migration sits alongside — caught by makemigrations
# while building that feature. Location's `ordering = ["name"]` Meta option
# and `Location.parent`'s on_delete=PROTECT were both added to models.py
# during the models.py -> models/ package split (see git history for
# apps/inventory/models/locations.py) but never migrated; separately,
# `Container.location` moved from DO_NOTHING to PROTECT (0021 recorded
# DO_NOTHING) at some later, unmigrated point. All three are schema-neutral
# for Meta.ordering and behavior-only for the FKs (PROTECT vs DO_NOTHING
# only changes what happens on an attempted delete) — no column changes.
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0026_null_placeholder_zero_tare_weights"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="location",
            options={"ordering": ["name"]},
        ),
        migrations.AlterField(
            model_name="container",
            name="location",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="containers",
                to="inventory.location",
            ),
        ),
        migrations.AlterField(
            model_name="location",
            name="parent",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="children",
                to="inventory.location",
            ),
        ),
    ]
