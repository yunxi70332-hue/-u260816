#!/usr/bin/env sh
set -eu

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
env_file=${USM_INSTANCE_ENV_FILE:-"$root_dir/.env"}
project_name=
confirmed=false

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
    --confirm)
      confirmed=true
      shift
      ;;
    *)
      if [ -n "${email:-}" ]; then
        echo "Usage: sh deploy/repair-platform-admin.sh [--env-file <path>] [--project-name <instance>] --confirm <platform-admin-email>" >&2
        exit 2
      fi
      email=$1
      shift
      ;;
  esac
done

if [ -z "${email:-}" ] || [ "$confirmed" != true ]; then
  echo "Usage: sh deploy/repair-platform-admin.sh [--env-file <path>] [--project-name <instance>] --confirm <platform-admin-email>" >&2
  exit 2
fi

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

db_user=$(sed -n 's/^POSTGRES_USER=//p' "$env_file" | head -n 1)
db_name=$(sed -n 's/^POSTGRES_DB=//p' "$env_file" | head -n 1)
db_user=${db_user:-usm_erp}
db_name=${db_name:-usm_erp}

docker compose --project-name "$project_name" --env-file "$env_file" -f "$root_dir/docker-compose.yml" \
  exec -T postgres psql -v ON_ERROR_STOP=1 -U "$db_user" -d "$db_name" -v platform_email="$email" <<'SQL'
BEGIN;

WITH selected AS (
  SELECT id
  FROM "user"
  WHERE lower(email) = lower(:'platform_email')
  LIMIT 1
), updated AS (
  UPDATE "user" AS platform_user
  SET role = 'admin',
      must_change_password = true,
      updated_at = now()
  FROM selected
  WHERE platform_user.id = selected.id
  RETURNING platform_user.id
)
SELECT 1 / count(*) FROM updated;

DELETE FROM member_permission_grants
WHERE member_id IN (
  SELECT member.id
  FROM member
  INNER JOIN "user" AS platform_user ON platform_user.id = member.user_id
  WHERE lower(platform_user.email) = lower(:'platform_email')
);

DELETE FROM member_data_scopes
WHERE member_id IN (
  SELECT member.id
  FROM member
  INNER JOIN "user" AS platform_user ON platform_user.id = member.user_id
  WHERE lower(platform_user.email) = lower(:'platform_email')
);

UPDATE member
SET status = 'active', updated_at = now()
WHERE user_id IN (
  SELECT id FROM "user" WHERE lower(email) = lower(:'platform_email')
);

DELETE FROM session
WHERE user_id IN (
  SELECT id FROM "user" WHERE lower(email) = lower(:'platform_email')
);

COMMIT;
SQL

echo "Platform administrator repaired for project $project_name. Sign in once and rotate the password immediately."
