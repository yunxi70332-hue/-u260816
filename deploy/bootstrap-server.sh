#!/usr/bin/env sh
set -eu

domain=${1:-}
case "$domain" in
  ""|*/*|*:*|*" "*)
    echo "Usage: sh deploy/bootstrap-server.sh example.com" >&2
    exit 2
    ;;
esac

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root_dir"

for command_name in docker openssl curl; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Required command is unavailable: $command_name" >&2
    exit 1
  }
done
docker compose version >/dev/null

if [ -e .env ]; then
  echo ".env already exists; refusing to overwrite production secrets." >&2
  exit 1
fi

postgres_password=$(openssl rand -hex 24)
auth_secret=$(openssl rand -hex 32)
object_secret=$(openssl rand -hex 24)
admin_password=$(openssl rand -hex 6)

cat > .env <<EOF
NODE_ENV=production
PUBLIC_DOMAIN=$domain
PUBLIC_ORIGIN=https://$domain
GATEWAY_PORT=18080

POSTGRES_DB=usm_erp
POSTGRES_USER=usm_erp
POSTGRES_PASSWORD=$postgres_password
DATABASE_URL=postgresql://usm_erp:$postgres_password@postgres:5432/usm_erp

BETTER_AUTH_SECRET=$auth_secret
BETTER_AUTH_URL=https://$domain
CORS_ORIGINS=https://$domain
SESSION_COOKIE_SECURE=true

BOOTSTRAP_ADMIN_EMAIL=admin@$domain
BOOTSTRAP_ADMIN_PASSWORD=$admin_password
BOOTSTRAP_ADMIN_NAME=System Administrator
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ORGANIZATION_NAME=Headquarters
BOOTSTRAP_ORGANIZATION_SLUG=headquarters

S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_BUCKET=usm-erp
S3_ACCESS_KEY=usm-erp-admin
S3_SECRET_KEY=$object_secret
MINIO_ROOT_USER=usm-erp-admin
MINIO_ROOT_PASSWORD=$object_secret
EOF
chmod 600 .env
mkdir -p deploy/backups

docker compose config --quiet
docker compose build
docker compose up -d

healthy=false
attempt=1
while [ "$attempt" -le 60 ]; do
  if curl --fail --silent --show-error http://127.0.0.1:18080/api/health >/dev/null 2>&1; then
    healthy=true
    break
  fi
  sleep 2
  attempt=$((attempt + 1))
done

if [ "$healthy" != true ]; then
  docker compose ps
  docker compose logs --tail 200 api
  echo "Deployment started, but the health endpoint did not become ready." >&2
  exit 1
fi

docker compose ps
printf '\nInitial administrator (shown by this script once):\n'
printf 'Email: %s\n' "admin@$domain"
printf 'Password: %s\n' "$admin_password"
printf '\nAfter changing the password in ERP, run:\n'
printf 'sh deploy/disable-bootstrap-admin.sh\n'
