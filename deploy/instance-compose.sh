#!/usr/bin/env sh
set -eu

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
instance=${1:-}

if [ -z "$instance" ]; then
  echo "Usage: sh deploy/instance-compose.sh <instance> <docker-compose-arguments...>" >&2
  exit 2
fi

case "$instance" in
  *[!a-z0-9-]*|""|-*|*--*|*-)
    echo "Instance must use lowercase letters, digits, and single hyphens: $instance" >&2
    exit 2
    ;;
esac

shift
if [ "$#" -eq 0 ]; then
  echo "A docker compose command is required." >&2
  exit 2
fi

env_file=${USM_INSTANCE_ENV_FILE:-"$root_dir/../instances/$instance/.env"}
if [ ! -f "$env_file" ]; then
  echo "Instance environment file was not found: $env_file" >&2
  exit 1
fi

configured_project=$(sed -n 's/^COMPOSE_PROJECT_NAME=//p' "$env_file" | head -n 1)
if [ "$configured_project" != "$instance" ]; then
  echo "COMPOSE_PROJECT_NAME in $env_file must equal $instance." >&2
  exit 1
fi

exec docker compose \
  --project-name "$instance" \
  --env-file "$env_file" \
  -f "$root_dir/docker-compose.yml" \
  "$@"
