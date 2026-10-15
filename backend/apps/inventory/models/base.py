from django.db import models


class TimeStampedModel(models.Model):
    """When a row was created and last changed, set automatically on save().

    Both are nullable: rows from before these columns existed have no real
    creation time, and a made-up one (the migration's date) would mislead.

    Neither is set by QuerySet.update() or bulk_update(), which skip save();
    code that writes in bulk sets updated_at itself, and save(update_fields=
    ...) has to list "updated_at" for it to be written.
    """

    created_at = models.DateTimeField("created", auto_now_add=True, null=True)
    updated_at = models.DateTimeField("last changed", auto_now=True, null=True)

    class Meta:
        abstract = True
