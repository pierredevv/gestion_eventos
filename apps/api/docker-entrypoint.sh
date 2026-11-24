#!/bin/sh
# Migrations are idempotent and run on every deploy with the direct (session)
# connection from DIRECT_URL. The application itself uses the transaction pooler.
set -eu

echo "Starting API on port ${PORT:-4000}…"
exec node dist/main.js
