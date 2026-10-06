"""The OpenAPI schema is what frontend/src/types/api.ts is generated from.

drf-spectacular warns when it has to guess a type, and its guess is usually
`string`: that is how the computed container fields ended up typed as
strings in the frontend. Failing on any warning keeps new guesses out.
"""

from django.core.management import call_command


def test_schema_generates_without_warnings(tmp_path):
    call_command("spectacular", "--fail-on-warn", "--file", str(tmp_path / "schema.yaml"))
