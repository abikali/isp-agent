-- ============================================================================
-- One-shot cleanup for dotnet2 seed/sync duplicate customer rows.
--
-- Context:
--   * `seed-dotnet2.ts` imported 391 rows from an xlsx with `externalId = null`.
--   * A later iRadius sync re-imported the same 391 people as fresh rows with
--     `externalId` set, because the sync only matches by externalId.
--   * Net result: every dotnet2-dealer customer exists twice locally — one
--     seed twin (unlinked, dealer has been editing) and one linked twin.
--   * Dealer edits on seed twins never reach iRadius because the mirror code
--     in `iradius-api.ts` short-circuits on `!customer.externalId`.
--
-- This script:
--   1. Picks the unambiguous seed-vs-linked pairs by lower(username).
--   2. Adds two manual mappings (`gabi`, `abounidal1`) whose usernames differ
--      between local and iRadius but unambiguously identify the same person.
--   3. Re-points every child row (payment, invoice, location_request, task,
--      audit_log) from seed twin to linked twin BEFORE deleting (CASCADE FKs
--      would otherwise drop payments/invoices).
--   4. Merges mirror-eligible field intent: any non-empty value the dealer
--      put on the seed twin overwrites the linked twin. Placeholder strings
--      like 'undefined' and the username-as-firstName auto-fill from the seed
--      script are filtered out so they don't pollute the kept row.
--   5. Deletes seed twins.
--
-- One seed twin (`georgeshaddad1`) has no iRadius counterpart and a distinct
-- mobile — it might be a genuinely new customer the dealer hasn't pushed yet.
-- Left untouched. Dealer can push it to iRadius from the UI when ready.
--
-- Runs inside a single transaction. Review the row counts; COMMIT or ROLLBACK
-- at the end.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Disable triggers/audit during bulk move to keep it fast (none in this DB).

CREATE TEMP TABLE merge_map (
    seed_id TEXT PRIMARY KEY,
    linked_id TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    note TEXT
);

-- 1. Auto pairs: unambiguous username match. One linked twin can have several
--    seed twins (e.g. `georgeskhalifi` and `main` each have 2 seed rows).
--    Flag the most recently `updatedAt` seed as `is_primary` — its field
--    values will overwrite the linked twin during the field-merge step.
--    Children from all matched seeds are still re-pointed regardless.
INSERT INTO merge_map (seed_id, linked_id, is_primary, note)
SELECT
    s.id,
    l.id,
    -- primary = the latest-updated seed per linked twin
    s.id = FIRST_VALUE(s.id) OVER (
        PARTITION BY l.id
        ORDER BY s."updatedAt" DESC NULLS LAST, s.id
    ),
    'auto-username-match'
FROM customer s
JOIN customer l
  ON l."organizationId" = s."organizationId"
 AND lower(l.username) = lower(s.username)
 AND l."externalId" IS NOT NULL
WHERE s."organizationId" = 'otoo1g7z3b3e9mai4p3snchd'
  AND s."externalId" IS NULL
  AND s.username IS NOT NULL;

-- 2. Manual pairs: seed username doesn't match iRadius username but it's
--    the same person (verified by name + mobile).
INSERT INTO merge_map (seed_id, linked_id, is_primary, note) VALUES
  -- seed username 'gabi' → iRadius 'gabidiab' (id 83486, Gabi Antar)
  ('izcbgrqqoqk3cpkp0y7z8vru', 'cmoxdxah50938gl1koj36dlau', TRUE, 'manual-gabi'),
  -- seed username 'abounidal1' → iRadius 'abounidal' (id 83084, same mobile)
  ('gkw6lr4vrlt9xqkze9x60087', 'cmoxdx9cv08wvgl1k39mhtlga', TRUE, 'manual-abounidal');

\echo 'merge_map size:'
SELECT note, COUNT(*) FROM merge_map GROUP BY note ORDER BY note;

-- 3. Sanity check: linked twin must still exist
SELECT 'ORPHAN linked_id (linked twin missing):' AS issue, m.linked_id
FROM merge_map m
LEFT JOIN customer c ON c.id = m.linked_id
WHERE c.id IS NULL;

-- 4. Sanity check: every seed twin in merge_map currently has externalId NULL
SELECT 'BAD seed_id (already linked!?):' AS issue, m.seed_id
FROM merge_map m
JOIN customer s ON s.id = m.seed_id
WHERE s."externalId" IS NOT NULL;

-- 5. Re-point CASCADE-FK children first (else delete would drop them)
WITH moved AS (
    UPDATE payment p SET "customerId" = m.linked_id
    FROM merge_map m
    WHERE p."customerId" = m.seed_id
    RETURNING 1
) SELECT 'payments re-pointed:' AS step, COUNT(*) AS rows FROM moved;

WITH moved AS (
    UPDATE customer_invoice ci SET "customerId" = m.linked_id
    FROM merge_map m
    WHERE ci."customerId" = m.seed_id
    RETURNING 1
) SELECT 'invoices re-pointed:' AS step, COUNT(*) AS rows FROM moved;

WITH moved AS (
    UPDATE location_request lr SET "customerId" = m.linked_id
    FROM merge_map m
    WHERE lr."customerId" = m.seed_id
    RETURNING 1
) SELECT 'location_requests re-pointed:' AS step, COUNT(*) AS rows FROM moved;

-- 6. Re-point SET-NULL children (preserves the link instead of losing it)
WITH moved AS (
    UPDATE task t SET "customerId" = m.linked_id
    FROM merge_map m
    WHERE t."customerId" = m.seed_id
    RETURNING 1
) SELECT 'tasks re-pointed:' AS step, COUNT(*) AS rows FROM moved;

-- 7. Audit log continuity (no FK, but we want history under the kept row)
WITH moved AS (
    UPDATE audit_log a SET "resourceId" = m.linked_id
    FROM merge_map m
    WHERE a."resourceId" = m.seed_id
      AND a."resourceType" = 'customer'
    RETURNING 1
) SELECT 'audit_log re-pointed:' AS step, COUNT(*) AS rows FROM moved;

-- 8. Merge mirror-eligible field intent from seed → linked.
--    Only overwrites the kept (linked) twin when the seed has a non-empty,
--    non-placeholder value the dealer actually entered. Placeholders we
--    filter out:
--      * 'undefined'                                  (xlsx import junk)
--      * firstName == username  (auto-filled by seed when no real first name)
--    Phone normalization quirks left as-is — dealer can fix on next edit;
--    the row will mirror to iRadius once it has a real edit.
UPDATE customer l
SET
    "firstName" = CASE
        WHEN s."firstName" IS NOT NULL
         AND s."firstName" <> ''
         AND s."firstName" <> 'undefined'
         AND lower(s."firstName") <> lower(coalesce(s.username, ''))
        THEN s."firstName"
        ELSE l."firstName"
    END,
    "lastName" = CASE
        WHEN s."lastName" IS NOT NULL AND s."lastName" <> ''
        THEN s."lastName"
        ELSE l."lastName"
    END,
    email = CASE
        WHEN s.email IS NOT NULL AND s.email <> ''
         AND s.email NOT LIKE 'exampl%@%'  -- skip obvious test values
        THEN s.email
        ELSE l.email
    END,
    mobile = COALESCE(NULLIF(s.mobile, ''), l.mobile),
    phones = CASE
        WHEN s.phones IS NOT NULL AND s.phones::text <> '[]' AND s.phones::text <> 'null'
        THEN s.phones
        ELSE l.phones
    END,
    address = COALESCE(NULLIF(s.address, ''), l.address),
    latitude  = COALESCE(s.latitude,  l.latitude),
    longitude = COALESCE(s.longitude, l.longitude),
    notes = CASE
        WHEN s.notes IS NOT NULL AND s.notes <> ''
        THEN CASE WHEN l.notes IS NULL OR l.notes = '' THEN s.notes
                  ELSE l.notes || E'\n---\n' || s.notes END
        ELSE l.notes
    END,
    -- status: take seed's status if dealer deactivated, otherwise keep linked
    status = CASE
        WHEN s.status = 'INACTIVE' AND l.status = 'ACTIVE'
        THEN s.status
        ELSE l.status
    END,
    -- updatedAt bumped so the next iRadius sync sees this as "fresh"
    "updatedAt" = GREATEST(l."updatedAt", s."updatedAt")
FROM merge_map m
JOIN customer s ON s.id = m.seed_id
WHERE l.id = m.linked_id
  AND m.is_primary = TRUE;

\echo 'merged fields into linked twins:'
SELECT COUNT(*) AS linked_rows_updated FROM merge_map;

-- 9. Final sanity: any seed twin still has child rows? (Should be 0.)
SELECT 'STRAY CHILD on seed:' AS issue, *
FROM (
    SELECT 'payment' AS tbl, "customerId" FROM payment WHERE "customerId" IN (SELECT seed_id FROM merge_map)
    UNION ALL
    SELECT 'customer_invoice', "customerId" FROM customer_invoice WHERE "customerId" IN (SELECT seed_id FROM merge_map)
    UNION ALL
    SELECT 'location_request', "customerId" FROM location_request WHERE "customerId" IN (SELECT seed_id FROM merge_map)
    UNION ALL
    SELECT 'task', "customerId" FROM task WHERE "customerId" IN (SELECT seed_id FROM merge_map)
) x LIMIT 5;

-- 10. Delete seed twins
WITH del AS (
    DELETE FROM customer
    WHERE id IN (SELECT seed_id FROM merge_map)
    RETURNING 1
) SELECT 'seed twins deleted:' AS step, COUNT(*) AS rows FROM del;

-- 11. Post-cleanup counts for verification
\echo 'POST-cleanup dotnet2 customer counts:'
SELECT
    COUNT(*) AS total,
    COUNT("externalId") AS linked,
    COUNT(*) - COUNT("externalId") AS unlinked
FROM customer
WHERE "organizationId" = 'otoo1g7z3b3e9mai4p3snchd';

\echo 'Remaining unlinked dotnet2 customers (should be the 1 unmatched: georgeshaddad1):'
SELECT id, username, "firstName", "lastName", mobile
FROM customer
WHERE "organizationId" = 'otoo1g7z3b3e9mai4p3snchd'
  AND "externalId" IS NULL;

-- COMMIT or ROLLBACK based on numbers above.
-- Default behaviour: this script does NOT auto-commit. Operator runs
-- `COMMIT;` after reviewing.
