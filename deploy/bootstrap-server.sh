#!/usr/bin/env sh
set -eu

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
domain=${1:-}
instance=${2:-usm-01}
gateway_port=${3:-18080}

if [ -z "$domain" ]; then
  echo "Usage: sh deploy/bootstrap-server.sh <domain> [instance] [gateway-port]" >&2
  exit 2
fi

echo "bootstrap-server.sh now creates an isolated instance environment outside the source checkout."
exec sh "$root_dir/deploy/bootstrap-instance.sh" "$instance" "$domain" "$gateway_port"
