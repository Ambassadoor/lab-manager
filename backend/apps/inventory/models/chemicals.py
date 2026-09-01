import re

from django.core.exceptions import ValidationError
from django.db import models


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


class Ingredient(models.Model):
    mixture = models.ForeignKey(Chemical, on_delete=models.CASCADE, related_name="ingredients")
    ingredient = models.ForeignKey(Chemical, on_delete=models.CASCADE, related_name="mixtures")

    def __str__(self):
        return self.ingredient.name
