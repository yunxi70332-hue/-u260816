#!/usr/bin/env sh
set -eu

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root_dir"

if [ ! -f .env ]; then
  echo ".env was not found." >&2
  exit 1
fi

temp_file=".env.bootstrap-clean.$$"
trap 'rm -f "$temp_file"' EXIT HUP INT TERM
awk '!/^BOOTSTRAP_ADMIN_(EMAIL|PASSWORD|NAME|USERNAME)=/' .env > "$temp_file"
chmod 600 "$temp_file"
mv "$temp_file" .env
trap - EXIT HUP INT TERM

docker compose config --quiet
docker compose up -d --force-recreate api
echo "Bootstrap administrator fields removed and the API container recreated."
