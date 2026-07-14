#!/bin/bash
set -euo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/codesync}"
REPO_URL="${REPO_URL:-}"
DOMAIN="${DOMAIN:-}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
NODE_ENV="${NODE_ENV:-production}"

if [[ -z "$REPO_URL" || -z "$DOMAIN" || -z "$CERTBOT_EMAIL" ]]; then
  echo "Usage:"
  echo "  REPO_URL=https://github.com/yourname/codesync.git DOMAIN=codesync.example.com CERTBOT_EMAIL=you@example.com ./infra/ec2-setup.sh"
  exit 1
fi

# EC2 setup script for Ubuntu 22.04 (tested target: t3.medium)
echo "=== Installing system deps ==="
sudo apt-get update -y
sudo apt-get install -y git nginx certbot python3-certbot-nginx redis-server postgresql-client

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2
sudo npm install -g pm2

echo "=== Cloning repo ==="
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

echo "=== Installing dependencies ==="
npm install
npm --prefix client install
npm --prefix server install

echo "=== Building ==="
npm run build
sudo mkdir -p /var/www/codesync
sudo rsync -a --delete client/dist/ /var/www/codesync/
sudo chown -R www-data:www-data /var/www/codesync

echo "=== Copying nginx config ==="
sed "s/__DOMAIN__/$DOMAIN/g" infra/nginx.conf | sudo tee /etc/nginx/sites-available/codesync >/dev/null
sudo ln -sf /etc/nginx/sites-available/codesync /etc/nginx/sites-enabled/codesync
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo "=== Starting with PM2 ==="
if [[ ! -f server/.env ]]; then
  cp server/.env.example server/.env
  sed -i "s|CLIENT_URL=.*|CLIENT_URL=https://$DOMAIN|" server/.env
  sed -i "s|PORT=.*|PORT=3001|" server/.env
fi

echo "=== IMPORTANT ==="
echo "Edit $APP_DIR/server/.env with production DATABASE_URL, Redis, JWT secrets, and Judge0 credentials before exposing traffic."

NODE_ENV="$NODE_ENV" pm2 startOrReload infra/ecosystem.config.cjs --env production
pm2 startup
pm2 save

echo "=== Requesting HTTPS certificate ==="
sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERTBOT_EMAIL" --redirect
sudo nginx -t && sudo systemctl reload nginx

echo "=== Done. After editing server/.env, run: pm2 restart codesync --update-env ==="
