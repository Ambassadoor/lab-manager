import re

from django.contrib.postgres.fields import ArrayField
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

    # Must check the format before parsing digits out of it — parts[-1] and
    # formatted below assume a well-formed "####-##-#" string, which a
    # regex mismatch doesn't guarantee (e.g. non-numeric or missing segments
    # would otherwise raise ValueError/IndexError instead of ValidationError).
    if not match:
        raise ValidationError(
            "Valid CAS numbers must follow the format '####-##-#'. The first part may have 2-7 digits, the second 2 digits, and the final 1 digit."
        )

    parts = cas.split("-")
    check_digit = int(parts[-1])
    formatted = "".join(parts[0:2])[::-1]

    cas_sum = 0
    for index, digit in enumerate(formatted):
        cas_sum += (index + 1) * int(digit)

    if cas_sum % 10 != check_digit:
        raise ValidationError(f"{cas} is not a valid CAS number")


class ChemicalStorageCategories(models.Model):
    """A Flinn Scientific storage pattern category (O1-O9, I1-I10, plus the
    miscellaneous O10/I11 — Flinn's OM/IM). See
    docs/Flinn Scientific Chemical Storage Pattern.md.
    """

    shorthand = models.CharField(max_length=3)
    # The chart's "Chemical Types" list — long enough for the full list
    # (e.g. I6's), which the old 50-char limit truncated
    description = models.CharField(max_length=255)
    help_text = models.TextField()
    # Chemical family names that file under this category (the chart's
    # family index), so a picker can find "Ketones" -> O4 by search
    families = ArrayField(models.CharField(max_length=100), default=list, blank=True)

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


class Ingredient(models.Model):
    mixture = models.ForeignKey(Chemical, on_delete=models.CASCADE, related_name="ingredients")
    ingredient = models.ForeignKey(Chemical, on_delete=models.CASCADE, related_name="mixtures")

    def __str__(self):
        return self.ingredient.name
