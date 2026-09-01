from django.core.exceptions import ValidationError
from django.db import models


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

    def clean(self):
        parent = self.parent
        while parent:
            if self.id is not None and parent.id == self.id:
                raise ValidationError({"parent": "A location cannot have itself as an ancestor."})
            parent = parent.parent

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ["name"]
