-- Backfill: the billing "Review stopped payment" tasks were created before
-- TaskSource.SYSTEM existed, so they landed as MANUAL and showed up in the
-- human /tasks list (which lists MANUAL + LEGACY). Retag them.
-- Separate migration from the enum addition on purpose: Postgres cannot use an
-- enum value in the same transaction that adds it.
UPDATE "task"
SET "source" = 'SYSTEM'
WHERE "source" = 'MANUAL'
  AND "title" LIKE 'Review stopped payment:%';
