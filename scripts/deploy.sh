#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
git fetch origin
git checkout -f main
git pull --ff-only origin main
docker compose -f docker-compose.prod.yml up -d --build
