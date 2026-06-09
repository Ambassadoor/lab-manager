import re
from django.db import models
from django.core.exceptions import ValidationError
from django.conf import settings


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
    shorthand = models.CharField(max_length=2)
    description = models.CharField(max_length=50)
    help_text = models.TextField()


class Chemical(models.Model):
    name = models.CharField(max_length=200)
    iupac = models.CharField(max_length=50)
    cas = models.CharField(max_length=13, validators=[validate_cas])
    formula = models.CharField(max_length=50)
    pubchem_cid = models.IntegerField()
    synonyms = models.JSONField()
    molecular_weight = models.DecimalField(max_digits=5, decimal_places=3)
    is_organic = models.BooleanField()
    storage_category = models.ForeignKey(
        ChemicalStorageCategories, on_delete=models.DO_NOTHING
    )


class SDS(models.Model):
    chemical = models.ForeignKey(Chemical, on_delete=models.DO_NOTHING)
    file_name = models.CharField(max_length=20)
    drive_id = models.CharField(max_length=100)
    revision_date = models.DateField(null=True, blank=True)
    revision_number = models.IntegerField(null=True, blank=True)
    is_uploaded = models.BooleanField(default=False)

class LocationTypes(models.Model):
    name = models.CharField(max_length=20, unique=True)
    slug = models.CharField(max_length=40, unique=True)
    description = models.CharField(max_length=100, null=True, blank=True)
    icon = models.CharField(max_length=25, null=True)

class Location(models.Model):
    name = models.CharField(max_length=20)
    type = models.ForeignKey(LocationTypes, on_delete=models.DO_NOTHING)
    parent = models.ForeignKey("self", on_delete=models.CASCADE, null=True, related_name="children")
    barcode = models.CharField(max_length=75)

class Container(models.Model):

    QUANTITY_UNIT_CHOICES = [
        ("mL", "mL"),
        ("L", "L"),
        ("mg", "mg"),
        ("g", "g"),
        ("kg", "kg"),
    ]

    name = models.CharField(max_length = 50)
    chemical = models.ForeignKey(Chemical, on_delete=models.DO_NOTHING)
    location = models.ForeignKey(Location, on_delete=models.DO_NOTHING)
    barcode = models.CharField(
        max_length=80,
        unique=True,
    )

    manufacturer = models.CharField(max_length=20)
    initial_quantity = models.IntegerField()
    quantity_unit = models.CharField(max_length=2, choices=QUANTITY_UNIT_CHOICES)
    product_num = models.CharField(max_length=25)
    sds = models.ForeignKey(SDS, on_delete=models.DO_NOTHING)
    date_received = models.DateField(auto_now=True)
    date_opened = models.DateField(null=True, blank=True)
    date_discarded = models.DateField(null=True, blank=True)
    density = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True)
    expiration_date = models.DateField(null=True, blank=True)
    initial_weight = models.DecimalField(max_digits=8, decimal_places=4)
    tare_weight = models.DecimalField(
        max_digits=8, decimal_places=4, null=True, blank=True
    )

    @property
    def label(self):
        return f"CHEM-{self.id}"

    @property
    def is_opened(self):
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


class WeightReading(models.Model):
    container = models.ForeignKey(Container, on_delete=models.CASCADE)
    weight = models.DecimalField(max_digits=8, decimal_places=4)
    recorded_at = models.DateTimeField(auto_now=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING
    )


class CheckoutEvent(models.Model):
    ACTION_CHOICES = [("in", "Check In"), ("out", "Check Out")]

    container = models.ForeignKey(Container, on_delete=models.CASCADE)
    action = models.CharField(max_length=3)
    timestamp = models.DateTimeField(auto_now=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING
    )
