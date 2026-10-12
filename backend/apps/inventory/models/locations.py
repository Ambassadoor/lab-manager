from django.core.exceptions import ValidationError
from django.db import models


class LocationTypes(models.Model):
    name = models.CharField(max_length=20, unique=True)
    slug = models.CharField(max_length=40, unique=True)
    description = models.CharField(max_length=100, null=True, blank=True)
    icon = models.CharField(max_length=25, null=True)

    def __str__(self):
        return self.name


def descendant_location_ids(location_id: int) -> list[int]:
    """The location and every location under it, at any depth.

    Two-step and query-count-flat whatever the tree's shape: one query loads
    every (id, parent_id) pair, then a walk over that map in Python collects
    the descendants (one query per node, as a recursive children.all()
    would, gets slow on a deep tree).
    """
    children_by_parent: dict[int | None, list[int]] = {}
    for child_id, parent_id in Location.objects.values_list("id", "parent_id"):
        children_by_parent.setdefault(parent_id, []).append(child_id)

    # `visited` guards against a corrupted parent chain (a cycle) turning
    # this into an infinite loop. Location.clean() blocks cycles through
    # normal save(), but nothing stops a bulk .update() from introducing one.
    location_ids = [location_id]
    visited = {location_id}
    queue = [location_id]
    while queue:
        current = queue.pop()
        for child_id in children_by_parent.get(current, []):
            if child_id in visited:
                continue
            visited.add(child_id)
            location_ids.append(child_id)
            queue.append(child_id)
    return location_ids


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
