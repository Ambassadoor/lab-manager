from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class LabelTemplate(models.Model):
    """A P-touch Template already transferred onto the Brother printer's own
    memory, registered here so the app can look one up by (kind, media
    width) instead of hardcoding template numbers/field names in code —
    see bridge/PRINTER_PLAN.md's "template registry" TODO.

    This table only *records* what's already on the printer. Creating or
    pushing a template there is still the one-time, manual, Windows-only
    step through P-touch Editor's Transfer Manager (see
    bridge/app/printer.py's print_label() docstring) — nothing here can do
    that for you.
    """

    class Kind(models.TextChoices):
        CONTAINER = "container", "Container"
        LOCATION = "location", "Location"

    # The TZe/HGe tape widths this printer actually takes (confirmed
    # against its own spec sheet — see PRINTER_PLAN.md), minus 0.13"/3.5mm:
    # that width is real but doesn't round-trip cleanly through the
    # printer's status response (a single integer-mm byte — see
    # bridge/app/printer.py's get_status()), so it can't be reliably
    # matched against live media at print time the way the others can.
    MEDIA_WIDTH_CHOICES = [
        (6, "6 mm"),
        (9, "9 mm"),
        (12, "12 mm"),
        (18, "18 mm"),
        (24, "24 mm"),
        (36, "36 mm"),
    ]

    name = models.CharField(
        max_length=50,
        help_text="Human-readable, e.g. 'Location label (12mm)'. Not sent to the printer.",
    )
    kind = models.CharField(max_length=20, choices=Kind.choices)
    template_number = models.PositiveSmallIntegerField(
        unique=True,
        validators=[MinValueValidator(1), MaxValueValidator(99)],
        help_text="The number assigned to this template in P-touch Transfer Manager (1-99).",
    )
    media_width_mm = models.PositiveSmallIntegerField(choices=MEDIA_WIDTH_CHOICES)

    class Meta:
        ordering = ["kind", "media_width_mm"]
        constraints = [
            # One registered template per kind per media width — the print
            # flow picks a template by matching the printer's *currently
            # loaded* media width, so two rows for the same (kind, width)
            # would make that lookup ambiguous.
            models.UniqueConstraint(
                fields=["kind", "media_width_mm"],
                name="unique_label_template_kind_media_width",
            )
        ]

    def __str__(self):
        return f"{self.name} (#{self.template_number}, {self.media_width_mm}mm)"


class LabelTemplateField(models.Model):
    """One P-touch object on a LabelTemplate, and which piece of app data it
    should receive. `role` is a fixed, small vocabulary the print flow
    knows how to compute a value for (see frontend's printTemplates.ts) —
    deliberately not a free-text field, so a mistyped role can't silently
    produce a template no print flow will ever fill in.
    """

    class Role(models.TextChoices):
        BARCODE = "barcode", "Barcode"
        TEXT = "text", "Text"

    template = models.ForeignKey(LabelTemplate, on_delete=models.CASCADE, related_name="fields")
    role = models.CharField(max_length=20, choices=Role.choices)
    object_name = models.CharField(
        max_length=50,
        help_text="The object's name inside the template, as set in P-touch Editor (e.g. 'Barcode1').",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["template", "role"], name="unique_label_template_field_role"
            )
        ]

    def __str__(self):
        return f"{self.template} — {self.get_role_display()}: {self.object_name}"
