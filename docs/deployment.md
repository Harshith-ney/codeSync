# CodeSync Deployment Runbook

This runbook targets Ubuntu 22.04 on an AWS EC2 `t3.medium` instance.

## Prerequisites

- A domain or subdomain pointed at the EC2 public IP with an `A` record.
- Inbound security group rules for ports `22`, `80`, and `443`.
- PostgreSQL available from the server. For a portfolio deployment, local PostgreSQL is acceptable; RDS is cleaner.
- Redis available from the server. The EC2-local Redis installed by the setup script is fine for one machine.
- Judge0 credentials.
- A pushed GitHub repository URL.

## One-command server setup

From a fresh EC2 checkout or after copying the repo to the server:

```bash
REPO_URL=https://github.com/YOUR_NAME/codesync.git \
DOMAIN=codesync.example.com \
CERTBOT_EMAIL=you@example.com \
bash infra/ec2-setup.sh
```

The script installs Node 20, Nginx, Certbot, Redis, PM2, builds the app, copies the client build to `/var/www/codesync`, starts the server with PM2 cluster mode, and requests an HTTPS certificate.

## Production environment

Before the app is considered live, edit `/home/ubuntu/codesync/server/.env`:

```bash
PORT=3001
NODE_ENV=production
CLIENT_URL=https://codesync.example.com
DATABASE_URL=postgres://user:password@host:5432/codesync
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-with-a-long-random-production-secret
JWT_REFRESH_SECRET=replace-with-a-different-long-random-production-secret
COOKIE_SECURE=true
JUDGE0_BASE_URL=https://ce.judge0.com
JUDGE0_API_KEY=replace-with-your-judge0-api-key
```

For a temporary IP-only HTTP deployment, use:

```bash
CLIENT_URL=http://54.196.134.253
COOKIE_SECURE=false
```

Switch `COOKIE_SECURE` back to `true` when the app is behind HTTPS.

Then restart:

```bash
pm2 restart codesync --update-env
pm2 logs codesync
```

## Verification

```bash
curl -fsS https://codesync.example.com/health
npm run test:smoke
BASE_URL=https://codesync.example.com k6 run load-tests/concurrent-users.js
```

For the smoke test against a deployed server, run it locally with:

```bash
CODESYNC_API_URL=https://codesync.example.com/api \
CODESYNC_WS_URL=https://codesync.example.com \
npm run test:smoke
```

## Load-test target

The default k6 target is 50 VUs for 60 seconds with `p95` WebSocket connection time below 200ms:

```bash
BASE_URL=https://codesync.example.com VUS=50 DURATION=60s k6 run load-tests/concurrent-users.js
```
