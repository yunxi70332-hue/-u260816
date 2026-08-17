#!/usr/bin/env sh
set -eu

instance=${1:-}
domain=${2:-}
gateway_port=${3:-}

if [ -z "$instance" ] || [ -z "$domain" ] || [ -z "$gateway_port" ]; then
  echo "Usage: sh deploy/bootstrap-instance.sh <instance> <domain> <gateway-port>" >&2
  exit 2
fi

case "$instance" in
  *[!a-z0-9-]*|""|-*|*--*|*-) echo "Invalid instance name: $instance" >&2; exit 2 ;;
esac
case "$domain" in
  *[!A-Za-z0-9.-]*|.*|*..*|*.-*|*-.|""|*/*|*:*|*" "*) echo "Invalid domain: $domain" >&2; exit 2 ;;
esac
case "$gateway_port" in
  *[!0-9]*|""|0) echo "Invalid gateway port: $gateway_port" >&2; exit 2 ;;
esac
if [ "$gateway_port" -gt 65535 ]; then
  echo "Invalid gateway port: $gateway_port" >&2
  exit 2
fi

for command_name in docker openssl curl; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Required command is unavailable: $command_name" >&2
    exit 1
  }
done
docker compose version >/dev/null

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
instances_dir=${USM_INSTANCES_DIR:-"$root_dir/../instances"}
backups_dir=${USM_BACKUPS_DIR:-"$root_dir/../backups"}
env_file="$instances_dir/$instance/.env"
backup_dir="$backups_dir/$instance"

if [ -e "$env_file" ]; then
  echo "Environment file already exists; refusing to overwrite secrets: $env_file" >&2
  exit 1
fi

suffix=${instance#usm-}
database_token=$(printf '%s' "$suffix" | tr '-' '_')
bucket_token=$(printf '%s' "$suffix" | tr '_' '-')
postgres_password=$(openssl rand -hex 24)
auth_secret=$(openssl rand -hex 32)
object_secret=$(openssl rand -hex 24)
admin_password=$(openssl rand -hex 6)

umask 077
mkdir -p "$(dirname "$env_file")" "$backup_dir"
cat > "$env_file" <<EOF
NODE_ENV=production
COMPOSE_PROJECT_NAME=$instance
GATEWAY_PORT=$gateway_port
BACKUP_DIR=$backup_dir

PUBLIC_DOMAIN=$domain
PUBLIC_ORIGIN=https://$domain

POSTGRES_DB=usm_erp_$database_token
POSTGRES_USER=usm_erp_$database_token
POSTGRES_PASSWORD=$postgres_password
DATABASE_URL=postgresql://usm_erp_$database_token:$postgres_password@postgres:5432/usm_erp_$database_token

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
S3_BUCKET=usm-erp-$bucket_token
S3_ACCESS_KEY=usm-erp-$bucket_token
S3_SECRET_KEY=$object_secret
MINIO_ROOT_USER=usm-erp-$bucket_token
MINIO_ROOT_PASSWORD=$object_secret
EOF
chmod 600 "$env_file"

USM_INSTANCE_ENV_FILE="$env_file" sh "$root_dir/deploy/instance-compose.sh" "$instance" config --quiet
USM_INSTANCE_ENV_FILE="$env_file" sh "$root_dir/deploy/instance-compose.sh" "$instance" up -d --build

healthy=false
attempt=1
while [ "$attempt" -le 60 ]; do
  if curl --fail --silent --show-error "http://127.0.0.1:$gateway_port/api/health" >/dev/null 2>&1; then
    healthy=true
    break
  fi
  sleep 2
  attempt=$((attempt + 1))
done

if [ "$healthy" != true ]; then
  USM_INSTANCE_ENV_FILE="$env_file" sh "$root_dir/deploy/instance-compose.sh" "$instance" ps
  USM_INSTANCE_ENV_FILE="$env_file" sh "$root_dir/deploy/instance-compose.sh" "$instance" logs --tail 200 api
  echo "Deployment started, but the health endpoint did not become ready." >&2
  exit 1
fi

USM_INSTANCE_ENV_FILE="$env_file" sh "$root_dir/deploy/instance-compose.sh" "$instance" ps
printf '\nInitial platform administrator (shown once):\n'
printf 'Email: %s\n' "admin@$domain"
printf 'Password: %s\n' "$admin_password"
printf '\nAfter the first password rotation, run:\n'
printf 'USM_INSTANCE_ENV_FILE=%s sh deploy/disable-bootstrap-admin.sh --project-name %s\n' "$env_file" "$instance"
