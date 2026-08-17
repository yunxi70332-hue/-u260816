#!/usr/bin/env sh
set -eu

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
env_file=${USM_INSTANCE_ENV_FILE:-"$root_dir/.env"}
project_name=

while [ "$#" -gt 0 ]; do
  case "$1" in
    --env-file)
      env_file=${2:-}
      shift 2
      ;;
    --project-name)
      project_name=${2:-}
      shift 2
      ;;
    *)
      echo "Usage: sh deploy/disable-bootstrap-admin.sh [--env-file <path>] [--project-name <instance>]" >&2
      exit 2
      ;;
  esac
done

if [ ! -f "$env_file" ]; then
  echo "Environment file was not found: $env_file" >&2
  exit 1
fi

if [ -z "$project_name" ]; then
  project_name=$(sed -n 's/^COMPOSE_PROJECT_NAME=//p' "$env_file" | head -n 1)
fi
configured_project=$(sed -n 's/^COMPOSE_PROJECT_NAME=//p' "$env_file" | head -n 1)
if [ -z "$configured_project" ] || [ "$project_name" != "$configured_project" ]; then
  echo "COMPOSE_PROJECT_NAME in $env_file must match --project-name." >&2
  exit 1
fi

temp_file="$env_file.bootstrap-clean.$$"
backup_file="$env_file.before-bootstrap-disable.$(date -u +%Y%m%dT%H%M%SZ)"
trap 'rm -f "$temp_file"' EXIT HUP INT TERM
awk '!/^BOOTSTRAP_ADMIN_(EMAIL|PASSWORD|NAME|USERNAME)=/' "$env_file" > "$temp_file"
chmod 600 "$temp_file"

docker compose --project-name "$project_name" --env-file "$temp_file" -f "$root_dir/docker-compose.yml" config --quiet
cp "$env_file" "$backup_file"
chmod 600 "$backup_file"
mv "$temp_file" "$env_file"
trap - EXIT HUP INT TERM

docker compose --project-name "$project_name" --env-file "$env_file" -f "$root_dir/docker-compose.yml" up -d --force-recreate api
echo "Bootstrap administrator fields removed and the API container recreated. Previous environment saved: $backup_file"
