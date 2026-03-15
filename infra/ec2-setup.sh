#!/bin/bash
set -e

# EC2 setup script for Ubuntu 22.04 (t3.medium)
echo "=== Installing system deps ==="
sudo apt-get update -y
sudo apt-get install -y nginx certbot python3-certbot-nginx redis-server

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2
sudo npm install -g pm2

echo "=== Cloning repo ==="
git clone https://github.com/yourusername/codesync.git /home/ubuntu/codesync
cd /home/ubuntu/codesync

echo "=== Installing dependencies ==="
npm install
cd client && npm install && cd ..
cd server && npm install && cd ..

echo "=== Building ==="
npm run build

echo "=== Copying nginx config ==="
sudo cp infra/nginx.conf /etc/nginx/sites-available/codesync
sudo ln -sf /etc/nginx/sites-available/codesync /etc/nginx/sites-enabled/codesync
sudo nginx -t && sudo systemctl reload nginx

echo "=== Starting with PM2 ==="
cd server
cp ../.env.example .env
# Edit .env manually with real secrets before starting
pm2 start dist/index.js --name codesync
pm2 startup
pm2 save

echo "=== Done. Edit /home/ubuntu/codesync/server/.env before running pm2 restart codesync ==="
