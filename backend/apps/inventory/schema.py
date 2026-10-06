"""Response shapes shared by several views, for the OpenAPI schema only.

The views build these bodies by hand; declaring them here lets
drf-spectacular describe them (and openapi-typescript type them) without
repeating the definition at each use. Nothing here runs at request time.
"""

from drf_spectacular.utils import inline_serializer
from rest_framework import serializers

# {"detail": "..."}: DRF's own error shape, also used by the custom actions
# for a "not found" or a rule they enforce themselves.
ERROR_DETAIL = inline_serializer(name="ErrorDetail", fields={"detail": serializers.CharField()})

# The 409 a container move answers with when it would put incompatible
# chemicals together (see storage_rules.py). Resending the same request with
# confirm_storage_conflicts: true goes ahead anyway.
STORAGE_CONFLICT = inline_serializer(
    name="StorageConflict",
    fields={
        "warnings": serializers.ListField(child=serializers.CharField()),
        "requires_confirmation": serializers.BooleanField(),
    },
)
