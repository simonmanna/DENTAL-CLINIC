#!/usr/bin/env bash
# Ship the working tree (git-ignored files excluded) to the VPS and rebuild
# the stack there.
#   scripts/deploy-vps.sh
# Override the target with VPS_HOST / VPS_KEY / VPS_DIR / PUBLIC_URL / HTTP_PORT.
set -euo pipefail

# SSH goes over Tailscale (avida-vps alias in ~/.ssh/config); the public IP is
# only used for the URL the app is served on.
VPS_HOST="${VPS_HOST:-avida-vps}"
VPS_PUBLIC_IP="${VPS_PUBLIC_IP:-169.58.5.88}"
VPS_KEY="${VPS_KEY:-$HOME/.ssh/avida_vps}"
VPS_DIR="${VPS_DIR:-/opt/dental-clinic}"
HTTP_PORT="${HTTP_PORT:-8092}"
PUBLIC_URL="${PUBLIC_URL:-http://${VPS_PUBLIC_IP}:${HTTP_PORT}}"

cd "$(git rev-parse --show-toplevel)"
SSH=(ssh -i "$VPS_KEY" -o BatchMode=yes "$VPS_HOST")

# Source only — .env and data/ on the server are never overwritten.
"${SSH[@]}" "mkdir -p '$VPS_DIR'/data/uploads '$VPS_DIR'/data/backups '$VPS_DIR'/data/backup-state"
git ls-files -co --exclude-standard backend frontend docker-compose.prod.yml \
  | tar -czf - -T - | "${SSH[@]}" "tar -xzf - -C '$VPS_DIR'"

# First run: generate secrets on the server so they never leave it.
"${SSH[@]}" "cd '$VPS_DIR' && [ -f .env ] || { umask 077; cat > .env <<EOF
POSTGRES_DB=dentaldb
POSTGRES_USER=dental
POSTGRES_PASSWORD=\$(openssl rand -hex 24)
JWT_ACCESS_SECRET=\$(openssl rand -hex 64)
JWT_REFRESH_SECRET=\$(openssl rand -hex 64)
PUBLIC_URL=$PUBLIC_URL
HTTP_PORT=$HTTP_PORT
CLINIC_TIMEZONE=Africa/Kampala
EOF
}"

"${SSH[@]}" "cd '$VPS_DIR' && docker compose -f docker-compose.prod.yml up -d --build && docker compose -f docker-compose.prod.yml ps"
