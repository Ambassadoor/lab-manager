#!/bin/sh
# Regenerates backend/openapi.json from the Django API, and
# frontend/src/types/api.ts from that. Never edit either file by hand.
#
# Run by the pre-commit hook, and by CI, which fails if the result differs
# from what is committed (a commit made without the hook installed).
set -e
cd "$(dirname "$0")/.."

(cd backend && poetry run python manage.py spectacular --format openapi-json --file openapi.json)
(
  cd frontend
  pnpm exec openapi-typescript ../backend/openapi.json --output ./src/types/api.ts
  # Only the generated file: formatting all of src/ would rewrite files
  # that aren't part of the commit.
  pnpm exec prettier --write src/types/api.ts >/dev/null
)
