# SDS feature: SDS documents are product-specific to a Container, not a
# Chemical in general (see SDS's docstring in models/containers.py), and
# Container.sds (a single FK) was never read anywhere in the codebase — the
# relationship now goes the other way (container.sds.all(), one container to
# many SDS revisions). No data migration needed: confirmed zero SDS rows
# exist (the model was a stub with no reader/writer built until now).
import django.contrib.postgres.fields
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0027_alter_location_options_alter_container_location_and_more"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="container",
            name="sds",
        ),
        migrations.RemoveField(
            model_name="sds",
            name="chemical",
        ),
        migrations.AddField(
            model_name="sds",
            name="container",
            field=models.ForeignKey(
                default=1,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="sds",
                to="inventory.container",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="sds",
            name="ghs_pictograms",
            field=django.contrib.postgres.fields.ArrayField(
                base_field=models.CharField(
                    choices=[
                        ("flammable", "Flammable"),
                        ("oxidizing", "Oxidizing"),
                        ("compressed_gas", "Compressed Gas"),
                        ("corrosive", "Corrosive"),
                        ("toxic", "Acute Toxicity"),
                        ("harmful", "Irritant / Harmful"),
                        ("health_hazard", "Health Hazard"),
                        ("explosive", "Explosive"),
                        ("environment", "Environmental Hazard"),
                    ],
                    max_length=20,
                ),
                blank=True,
                default=list,
                size=None,
            ),
        ),
        migrations.AlterField(
            model_name="sds",
            name="file_name",
            field=models.CharField(max_length=255),
        ),
    ]
