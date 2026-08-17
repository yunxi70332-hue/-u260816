#!/usr/bin/env sh
set -eu

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root_dir"

email=${1:-}
if [ -z "$email" ]; then
  echo "Usage: sh deploy/repair-platform-admin.sh <platform-admin-email>" >&2
  exit 2
fi

if [ ! -f .env ]; then
  echo ".env was not found." >&2
  exit 1
fi

set -a
. ./.env
set +a

db_user=${POSTGRES_USER:-usm_erp}
db_name=${POSTGRES_DB:-usm_erp}

docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "$db_user" -d "$db_name" -v platform_email="$email" <<'SQL'
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

echo "Platform administrator repaired. Sign in once and rotate the password immediately."
