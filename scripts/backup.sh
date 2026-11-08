#!/bin/sh
set -eu
APP_DIR="${APP_DIR:-/srv/copro}"
BACKUP_DIR="${BACKUP_DIR:-/srv/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP=$(date +%F)

mkdir -p "$BACKUP_DIR"

docker compose -f "$APP_DIR/docker-compose.prod.yml" exec -T copro \
  node -e "new (require('better-sqlite3'))(process.env.DB_PATH).backup('/app/data/copro-backup.db')"
mv "$APP_DIR/data/copro-backup.db" "$BACKUP_DIR/copro-$STAMP.db"
tar czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" -C "$APP_DIR" uploads

find "$BACKUP_DIR" -name 'copro-*.db' -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name 'uploads-*.tar.gz' -mtime +"$RETENTION_DAYS" -delete
