import re
from django.db import models
from django.core.exceptions import ValidationError
from django.conf import settings
from django.utils import timezone
from django.db.models import Max


# Validator for submitted cas nums
def validate_cas(cas: str):
    """Checks that the provided CAS number is the correct format, and is valid.

    Args:
        cas (str): The CAS number

    Raises:
        ValidationError: The provided CAS is invalid
        ValidationError: The provided CAS isn't the correct format
    """
    cas_regex = r"^[0-9]{2,7}-[0-9]{2}-[0-9]{1}$"
    match = re.match(cas_regex, cas)

    parts = cas.split("-")
    check_digit = int(parts[-1])
    formatted = "".join(parts[0:2])[::-1]

    if match:
        cas_sum = 0
        for index, digit in enumerate(formatted):
            cas_sum += (index + 1) * int(digit)

        if cas_sum % 10 != check_digit:
            raise ValidationError(f"{cas} is not a valid CAS number")
    else:
        raise ValidationError(
            "Valid CAS numbers must follow the format '####-##-#'. The first part may have 2-7 digits, the second 2 digits, and the final 1 digit."
        )


class ChemicalStorageCategories(models.Model):
    shorthand = models.CharField(max_length=3)
    description = models.CharField(max_length=50)
    help_text = models.TextField()

    def __str__(self):
        return self.shorthand


class Chemical(models.Model):
    name = models.CharField(max_length=200)
    iupac = models.CharField(max_length=300, blank=True, null=True)
    cas = models.CharField(
        max_length=13, validators=[validate_cas], null=True, blank=True, unique=True
    )
    formula = models.CharField(max_length=50, null=True, blank=True)
    pubchem_cid = models.IntegerField(null=True, blank=True)
    synonyms = models.JSONField(null=True, blank=True)
    molecular_weight = models.DecimalField(max_digits=7, decimal_places=3, null=True, blank=True)
    is_organic = models.BooleanField(null=True, blank=True)
    storage_category = models.ForeignKey(
        ChemicalStorageCategories,
        on_delete=models.DO_NOTHING,
        null=True,
        blank=True,
        related_name="chemicals",
    )

    def __str__(self):
        return self.name


class SDS(models.Model):
    chemical = models.ForeignKey(Chemical, on_delete=models.DO_NOTHING, related_name="sds")
    file_name = models.CharField(max_length=20)
    drive_id = models.CharField(max_length=100)
    revision_date = models.DateField(null=True, blank=True)
    revision_number = models.IntegerField(null=True, blank=True)
    is_uploaded = models.BooleanField(default=False)

    def __str__(self):
        return self.file_name


class LocationTypes(models.Model):
    name = models.CharField(max_length=20, unique=True)
    slug = models.CharField(max_length=40, unique=True)
    description = models.CharField(max_length=100, null=True, blank=True)
    icon = models.CharField(max_length=25, null=True)

    def __str__(self):
        return self.name


class Location(models.Model):
    name = models.CharField(max_length=20)
    type = models.ForeignKey(LocationTypes, on_delete=models.DO_NOTHING, related_name="locations")
    parent = models.ForeignKey(
        "self", on_delete=models.PROTECT, null=True, blank=True, related_name="children"
    )
    barcode = models.CharField(max_length=75, null=True, blank=True)

    @property
    def full_path(self) -> str:
        parent = self.parent
        locations = [self.name]
        while parent:
            locations.append(parent.name)
            parent = parent.parent
        locations.reverse()
        return " ".join(locations)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ["name"]


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
        return self.tare_weight is not None

    @property
    def quantity(self) -> str:
        return f"{self.initial_quantity} {self.quantity_unit}"

    def __str__(self):
        return self.name


class Ingredient(models.Model):
    mixture = models.ForeignKey(Chemical, on_delete=models.CASCADE, related_name="ingredients")
    ingredient = models.ForeignKey(Chemical, on_delete=models.CASCADE, related_name="mixtures")

    def __str__(self):
        return self.ingredient.name


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
