#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Lancer en root : sudo $0 <domaine.exemple.fr>"
  exit 1
fi

DOMAIN="${1:?Usage: sudo $0 <domaine.exemple.fr>}"
APP_DIR=/srv/copro
BACKUP_DIR=/srv/backups
BRANCH=vibe/copro-app-010909

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y git curl ca-certificates ufw

curl -fsSL https://get.docker.com | sh

git clone https://github.com/Nulltread/COPRO.git "$APP_DIR"
cd "$APP_DIR"
git checkout "$BRANCH"

cp .env.example .env

if ! command -v node >/dev/null 2>&1; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs npm
fi
VAPID=$(npx --yes web-push generate-vapid-keys)
PUB=$(printf '%s\n' "$VAPID" | sed -n 's/^Public Key: //p')
PRIV=$(printf '%s\n' "$VAPID" | sed -n 's/^Private Key: //p')
sed -i "s/^VAPID_PUBLIC_KEY=.*/VAPID_PUBLIC_KEY=$PUB/" .env
sed -i "s/^VAPID_PRIVATE_KEY=.*/VAPID_PRIVATE_KEY=$PRIV/" .env

sed -i "s/^copro\.exemple\.fr\$/$DOMAIN/" Caddyfile

docker compose -f docker-compose.prod.yml up -d --build

mkdir -p "$BACKUP_DIR"
CRON_LINE="0 3 * * * APP_DIR=$APP_DIR BACKUP_DIR=$BACKUP_DIR $APP_DIR/scripts/backup.sh >> /var/log/copro-backup.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'scripts/backup.sh' ; echo "$CRON_LINE" ) | crontab -

ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "OK: https://$DOMAIN sera actif des que le DNS (record A vers l'IP du serveur) sera propage."
