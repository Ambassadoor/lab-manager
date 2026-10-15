from django.db import migrations
from django.utils import timezone

REASON = "Starting point: change history was turned on"


def baseline(apps, schema_editor):
    # One history row per existing container and SDS, holding its values as
    # they are now, so the first real edit has something to compare with.
    # Done here rather than with `populate_history`, which skips a model as
    # soon as it has any history: an edit made on the Pi between `migrate`
    # and running it would have stopped it for good.
    now = timezone.now()
    for name in ("Container", "SDS"):
        model = apps.get_model("inventory", name)
        history = apps.get_model("inventory", f"Historical{name}")
        copied = [
            f.attname for f in history._meta.concrete_fields if not f.name.startswith("history_")
        ]
        history.objects.bulk_create(
            [
                history(
                    **{field: getattr(row, field) for field in copied},
                    history_date=now,
                    history_type="+",
                    history_change_reason=REASON,
                )
                for row in model.objects.all().iterator()
            ],
            batch_size=500,
        )


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0038_container_sds_history"),
    ]

    operations = [
        migrations.RunPython(baseline, migrations.RunPython.noop),
    ]
