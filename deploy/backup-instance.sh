#!/usr/bin/env sh
set -eu

instance=${1:-}
if [ -z "$instance" ]; then
  echo "Usage: sh deploy/backup-instance.sh <instance>" >&2
  exit 2
fi

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
env_file=${USM_INSTANCE_ENV_FILE:-"$root_dir/../instances/$instance/.env"}
if [ ! -f "$env_file" ]; then
  echo "Instance environment file was not found: $env_file" >&2
  exit 1
fi

backup_dir=$(sed -n 's/^BACKUP_DIR=//p' "$env_file" | head -n 1)
if [ -z "$backup_dir" ]; then
  echo "BACKUP_DIR is required in $env_file." >&2
  exit 1
fi

umask 077
mkdir -p "$backup_dir"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
work_dir=$(mktemp -d "$backup_dir/.${instance}-${timestamp}.XXXXXX")
destination="$backup_dir/${instance}-${timestamp}"
trap 'rm -rf "$work_dir"' EXIT HUP INT TERM

USM_INSTANCE_ENV_FILE="$env_file" sh "$root_dir/deploy/instance-compose.sh" "$instance" exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$work_dir/postgres.dump"
USM_INSTANCE_ENV_FILE="$env_file" sh "$root_dir/deploy/instance-compose.sh" "$instance" cp minio:/data "$work_dir/minio-data"

printf 'instance=%s\ncreated_at_utc=%s\n' "$instance" "$timestamp" > "$work_dir/metadata.txt"
(cd "$work_dir" && find . -type f -exec sha256sum {} \; | sort) > "$work_dir/SHA256SUMS"
mv "$work_dir" "$destination"
trap - EXIT HUP INT TERM

echo "PostgreSQL and MinIO backup created: $destination"
