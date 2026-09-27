#!/bin/sh
set -e

echo "Applying database migrations..."
npx prisma migrate deploy

echo "Seeding database (skips automatically if data already exists)..."
npx tsx prisma/seed.ts || true

echo "Starting server..."
exec node dist/index.js
