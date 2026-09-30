-- Narrow the Telegram ISP bot's API key to exactly what the bot calls.
--
-- Today: {write:*, read:customers}. write:* covers every write:<x> an API-key
-- endpoint will ever check, so a leaked bot key reaches all of them.
-- After:  {write:tasks, read:customers, write:customer-mac}
--   write:tasks         POST /api/task-ingest/:slug, GET .../open-tasks
--   read:customers      GET  /api/customer-search/:slug
--   write:customer-mac  POST /api/customer-reset-mac/:slug (admin Reset MAC)
--
-- Deploy the app build that knows write:customer-mac BEFORE running this.
-- Idempotent: a second run matches 0 rows.
--
-- DRY RUN by default: the transaction ends in ROLLBACK. Read the two SELECTs,
-- then change the last line to COMMIT to apply.
--
-- Run on prod (never print the key itself; only the prefix is selected):
--   ssh root@209.38.103.160 "docker exec -i \$(docker ps --filter label=coolify.resourceName=libancom-db -q) psql -U postgres -d libancom" < narrow-bot-key.sql

BEGIN;

SELECT id, name, "keyPrefix", permissions, "revokedAt"
FROM api_key
WHERE name = 'Telegram ISP Bot'
  AND "keyPrefix" LIKE 'libancom_yV-qI%'
  AND "revokedAt" IS NULL;

UPDATE api_key
SET permissions = ARRAY['write:tasks', 'read:customers', 'write:customer-mac']::text[]
WHERE name = 'Telegram ISP Bot'
  AND "keyPrefix" LIKE 'libancom_yV-qI%'
  AND "revokedAt" IS NULL
  AND permissions IS DISTINCT FROM ARRAY['write:tasks', 'read:customers', 'write:customer-mac']::text[]
RETURNING id, "keyPrefix", permissions;

ROLLBACK;
