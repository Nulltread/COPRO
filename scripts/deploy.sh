#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
git pull --ff-only origin vibe/copro-app-010909
docker compose -f docker-compose.prod.yml up -d --build
