from django.conf import settings
from django.db import models
from django.db.models import Max
from django.utils import timezone

from .chemicals import Chemical, SDS
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
    sds = models.ForeignKey(
        SDS, on_delete=models.DO_NOTHING, null=True, blank=True, verbose_name="sds"
    )
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
        return f"{self.initial_quantity} {self.quantity_unit}"

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
