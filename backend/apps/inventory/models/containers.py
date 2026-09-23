from decimal import Decimal, DecimalException, ROUND_HALF_UP

from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.models import Max, OuterRef
from django.utils import timezone

from .chemicals import Chemical
from .locations import Location


class Container(models.Model):
    QUANTITY_UNIT_CHOICES = [
        ("mL", "mL"),
        ("L", "L"),
        ("mg", "mg"),
        ("g", "g"),
        ("kg", "kg"),
    ]

    name = models.CharField(max_length=200)
    slug = models.SlugField(unique=True)
    chemical = models.ForeignKey(Chemical, on_delete=models.DO_NOTHING, related_name="containers")
    location = models.ForeignKey(Location, on_delete=models.PROTECT, related_name="containers")
    barcode = models.CharField(max_length=80, unique=True, null=True, blank=True)

    manufacturer = models.CharField("manufacturer", max_length=50, null=True, blank=True)
    initial_quantity = models.IntegerField("quantity", null=True, blank=True)
    quantity_unit = models.CharField(
        "unit", max_length=2, choices=QUANTITY_UNIT_CHOICES, null=True, blank=True
    )
    product_num = models.CharField("product #", max_length=25, null=True, blank=True)
    date_received = models.DateField("received on", default=timezone.now, null=True, blank=True)
    date_opened = models.DateField("opened on", null=True, blank=True)
    date_discarded = models.DateField("discarded on", null=True, blank=True)
    density = models.DecimalField(
        "density/specific gravity",
        max_digits=4,
        decimal_places=2,
        null=True,
        blank=True,
    )
    expiration_date = models.DateField("expires on", null=True, blank=True)
    initial_weight = models.DecimalField(
        "initial weight", max_digits=8, decimal_places=4, null=True, blank=True
    )
    tare_weight = models.DecimalField(
        "container weight", max_digits=8, decimal_places=4, null=True, blank=True
    )

    @property
    def label(self) -> str:
        highest_pk = Container.objects.aggregate(Max("pk"))["pk__max"]
        max_length = len(str(highest_pk))
        return f"CHEM-{self.id:0>{max_length}}"

    @property
    def is_opened(self) -> bool:
        return self.date_opened is not None

    @property
    def initial_content_mass(self):
        if self.density is not None and not self.quantity_unit.endswith("g"):
            return self.initial_quantity * self.density
        return self.initial_quantity

    @property
    def container_weight(self):
        return self.initial_weight - self.initial_content_mass

    @property
    def has_estimated_usage(self):
        # A container's tare weight is the weight of the empty container —
        # physically always > 0. Treating a non-positive value the same as
        # "missing" guards against the exact placeholder-zero bug fixed in
        # migration 0026_null_placeholder_zero_tare_weights recurring (e.g.
        # from a future bulk import).
        return self.tare_weight is not None and self.tare_weight > 0

    @property
    def quantity(self) -> str:
        # Both fields are nullable — without these checks an f-string renders
        # a missing value as the literal "None" (e.g. "None None" in the grid).
        # `is None`, not falsiness, so a real quantity of 0 still displays.
        if self.initial_quantity is None:
            return ""
        if not self.quantity_unit:
            return str(self.initial_quantity)
        return f"{self.initial_quantity} {self.quantity_unit}"

    # The one place this is computed — DashboardView's restock_soon query
    # used to reimplement this as a raw weight/initial_weight SQL division,
    # silently different from this (no tare-weight subtraction, dividing by
    # the whole container's initial weight instead of just its content
    # mass) — badly undercounting how empty a container actually was, since
    # a container's own tare weight is usually most of its initial_weight.
    # initial_content_mass's density/unit conditional can't reduce to a
    # single SQL expression cleanly anyway, which is also why
    # ?view=restock_soon is re-filtered client-side in Containers.tsx
    # rather than trusted from a backend annotation.
    @property
    def percent_remaining(self):
        """Percentage of the container's original chemical content still
        present, based on its most recent weight reading:
        (current weight - tare weight) / initial content mass * 100. None
        when there isn't enough data yet to compute a meaningful value (no
        reading, no real tare weight, or no derivable content mass).
        """
        if self.initial_content_mass is None:
            return None
        if self.tare_weight is None or self.tare_weight <= 0:
            return None
        latest = self.readings.order_by("-recorded_at").first()
        if latest is None:
            return None
        try:
            mass = Decimal(str(self.initial_content_mass))
            current_weight = Decimal(str(latest.weight))
            tare_weight = Decimal(str(self.tare_weight))
            result = ((current_weight - tare_weight) / mass) * 100
            return result.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        except DecimalException:
            return None

    def __str__(self):
        return self.name


class WeightReading(models.Model):
    container = models.ForeignKey(Container, on_delete=models.CASCADE, related_name="readings")
    weight = models.DecimalField(max_digits=8, decimal_places=4)
    recorded_at = models.DateTimeField(auto_now=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, related_name="readings"
    )

    def __str__(self):
        return f"{self.container.name}: {self.weight}"


class CheckoutEvent(models.Model):
    ACTION_CHOICES = [("in", "Check In"), ("out", "Check Out")]

    container = models.ForeignKey(Container, on_delete=models.CASCADE, related_name="events")
    action = models.CharField(max_length=3, choices=ACTION_CHOICES)
    timestamp = models.DateTimeField(auto_now=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, related_name="events"
    )
    related_event = models.OneToOneField(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="check_in_event",
        unique=True,
    )

    def __str__(self):
        return f"{self.container.name}: {self.action}"


# Shared by DashboardView (checked_out card) and ContainerFilter.checkout_status
# (?checkout_status=out/in) — both need "this container's most recent
# CheckoutEvent.<field>", keyed for use with .annotate(Subquery(...)). Kept as
# one function so the "most recent" tiebreak (order_by("-timestamp")) can't
# drift between the two call sites.
def most_recent_checkout_event_subquery(field: str):
    return (
        CheckoutEvent.objects.filter(container_id=OuterRef("pk"))
        .order_by("-timestamp")
        .values(field)[:1]
    )


class GHSPictogram(models.TextChoices):
    FLAMMABLE = "flammable", "Flammable"
    OXIDIZING = "oxidizing", "Oxidizing"
    COMPRESSED_GAS = "compressed_gas", "Compressed Gas"
    CORROSIVE = "corrosive", "Corrosive"
    TOXIC = "toxic", "Acute Toxicity"
    HARMFUL = "harmful", "Irritant / Harmful"
    HEALTH_HAZARD = "health_hazard", "Health Hazard"
    EXPLOSIVE = "explosive", "Explosive"
    ENVIRONMENT = "environment", "Environmental Hazard"


class SDS(models.Model):
    # A safety data sheet is specific to a container's actual product (a
    # given chemical from two manufacturers can have two different SDS
    # documents) — not the Chemical in general. A Chemical's "all SDS" view
    # (ChemicalSerializer.get_sds) aggregates across its containers instead
    # of this being a direct FK to Chemical.
    container = models.ForeignKey(Container, on_delete=models.CASCADE, related_name="sds")
    file_name = models.CharField(max_length=255)
    drive_id = models.CharField(max_length=100)
    revision_date = models.DateField(null=True, blank=True)
    # Text, not a number — real-world SDS revision labels aren't always
    # plain integers (the source data this was reconciled against uses
    # "6.7", "8.2" style decimal versioning), so this holds whatever the
    # manufacturer actually calls it rather than lossily coercing it.
    revision_number = models.CharField(max_length=20, null=True, blank=True)
    ghs_pictograms = ArrayField(
        models.CharField(max_length=20, choices=GHSPictogram.choices),
        default=list,
        blank=True,
    )
    # Reserved for a later, separate feature: pushing the file on to a
    # university-wide EHS system (a requirement independent of this
    # project). Not set by anything in this app today.
    is_uploaded = models.BooleanField(default=False)

    def __str__(self):
        return self.file_name
