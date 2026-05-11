-- One-shot cleanup for dotnet2 duplicate employee rows.
--
-- Two employees exist twice: one locally-created (no externalId) tied to the
-- login user, one iRadius-synced (has externalId) holding every customer /
-- cash-collection assignment.
--
-- Mapping:
--   dany sleiman:      seeded=eh13ag66gp1k5cl1m1echjgw  → linked=cmoxdw7dl03ungl1kznk6k849 (ext 82748)
--   collgeorgesatalah: seeded=cmomxilbn0007t01kn9h5fewq → linked=cmoxdw7dh03ulgl1kj7wj367c (ext 82685)
--
-- Order matters because (organizationId, email) and userId are both UNIQUE.
-- We snapshot seeded values, delete the seeded row to free up the unique
-- keys, then write the seeded values onto the linked row.

BEGIN;

CREATE TEMP TABLE merge_map (
    seeded_id TEXT PRIMARY KEY,
    linked_id TEXT NOT NULL
);
INSERT INTO merge_map VALUES
  ('eh13ag66gp1k5cl1m1echjgw',  'cmoxdw7dl03ungl1kznk6k849'),
  ('cmomxilbn0007t01kn9h5fewq', 'cmoxdw7dh03ulgl1kj7wj367c');

-- Snapshot seeded values BEFORE we delete the row. We'll merge these into
-- the linked twin after the delete frees the (org, email) and userId unique
-- keys.
CREATE TEMP TABLE seeded_snapshot AS
SELECT
    m.seeded_id,
    m.linked_id,
    seeded."userId"           AS s_user_id,
    seeded.name               AS s_name,
    seeded.email              AS s_email,
    seeded.phone              AS s_phone,
    seeded.username           AS s_username,
    seeded."telegram_chat_id" AS s_telegram_chat_id,
    seeded.notes              AS s_notes
FROM merge_map m
JOIN employee seeded ON seeded.id = m.seeded_id;

\echo 'seeded snapshot:'
SELECT * FROM seeded_snapshot;

\echo 'COLLISION check (linked twins must not already hold a userId):'
SELECT m.linked_id, e."userId"
FROM merge_map m
JOIN employee e ON e.id = m.linked_id
WHERE e."userId" IS NOT NULL;

-- 1. Re-point every child FK. RESTRICT FKs (cash_collection, expense,
--    installation, payment.collectorId) MUST be re-pointed before the
--    delete or the delete fails. SET NULL / CASCADE FKs are re-pointed
--    too so history stays attached to the kept employee.
WITH moved AS (
    UPDATE customer c SET "collectorId" = m.linked_id
    FROM merge_map m WHERE c."collectorId" = m.seeded_id RETURNING 1
) SELECT 'customer.collectorId moved:' AS step, COUNT(*) AS rows FROM moved;

WITH moved AS (
    UPDATE customer c SET worker_id = m.linked_id
    FROM merge_map m WHERE c.worker_id = m.seeded_id RETURNING 1
) SELECT 'customer.worker_id moved:' AS step, COUNT(*) AS rows FROM moved;

WITH moved AS (
    UPDATE cash_collection cc SET "collectorId" = m.linked_id
    FROM merge_map m WHERE cc."collectorId" = m.seeded_id RETURNING 1
) SELECT 'cash_collection moved:' AS step, COUNT(*) AS rows FROM moved;

WITH moved AS (
    UPDATE payment p SET "collectorId" = m.linked_id
    FROM merge_map m WHERE p."collectorId" = m.seeded_id RETURNING 1
) SELECT 'payment.collectorId moved:' AS step, COUNT(*) AS rows FROM moved;

WITH moved AS (
    UPDATE payment p SET "workerId" = m.linked_id
    FROM merge_map m WHERE p."workerId" = m.seeded_id RETURNING 1
) SELECT 'payment.workerId moved:' AS step, COUNT(*) AS rows FROM moved;

WITH moved AS (
    UPDATE expense ex SET "submittedById" = m.linked_id
    FROM merge_map m WHERE ex."submittedById" = m.seeded_id RETURNING 1
) SELECT 'expense.submittedById moved:' AS step, COUNT(*) AS rows FROM moved;

WITH moved AS (
    UPDATE installation i SET "employeeId" = m.linked_id
    FROM merge_map m WHERE i."employeeId" = m.seeded_id RETURNING 1
) SELECT 'installation.employeeId moved:' AS step, COUNT(*) AS rows FROM moved;

WITH moved AS (
    UPDATE stock_log sl SET "employeeId" = m.linked_id
    FROM merge_map m WHERE sl."employeeId" = m.seeded_id RETURNING 1
) SELECT 'stock_log.employeeId moved:' AS step, COUNT(*) AS rows FROM moved;

-- CASCADE FKs: re-point instead of letting delete cascade (preserves rows).
-- task_assignment and employee_station have UNIQUE constraints on
-- (employeeId, …) so a duplicate on the linked side would block. Drop
-- conflicting seeded rows first.
WITH dropped AS (
    DELETE FROM task_assignment ta
    USING merge_map m
    WHERE ta."employeeId" = m.seeded_id
      AND EXISTS (
          SELECT 1 FROM task_assignment ta2
          WHERE ta2."taskId" = ta."taskId"
            AND ta2."employeeId" = m.linked_id
      )
    RETURNING 1
) SELECT 'task_assignment dupes dropped:' AS step, COUNT(*) AS rows FROM dropped;

WITH moved AS (
    UPDATE task_assignment ta SET "employeeId" = m.linked_id
    FROM merge_map m WHERE ta."employeeId" = m.seeded_id RETURNING 1
) SELECT 'task_assignment moved:' AS step, COUNT(*) AS rows FROM moved;

WITH dropped AS (
    DELETE FROM employee_station es
    USING merge_map m
    WHERE es."employeeId" = m.seeded_id
      AND EXISTS (
          SELECT 1 FROM employee_station es2
          WHERE es2."stationId" = es."stationId"
            AND es2."employeeId" = m.linked_id
      )
    RETURNING 1
) SELECT 'employee_station dupes dropped:' AS step, COUNT(*) AS rows FROM dropped;

WITH moved AS (
    UPDATE employee_station es SET "employeeId" = m.linked_id
    FROM merge_map m WHERE es."employeeId" = m.seeded_id RETURNING 1
) SELECT 'employee_station moved:' AS step, COUNT(*) AS rows FROM moved;

WITH dropped AS (
    DELETE FROM worker_stock ws
    USING merge_map m
    WHERE ws."employeeId" = m.seeded_id
      AND EXISTS (
          SELECT 1 FROM worker_stock ws2
          WHERE ws2."stockItemId" = ws."stockItemId"
            AND ws2."employeeId" = m.linked_id
      )
    RETURNING 1
) SELECT 'worker_stock dupes dropped:' AS step, COUNT(*) AS rows FROM dropped;

WITH moved AS (
    UPDATE worker_stock ws SET "employeeId" = m.linked_id
    FROM merge_map m WHERE ws."employeeId" = m.seeded_id RETURNING 1
) SELECT 'worker_stock moved:' AS step, COUNT(*) AS rows FROM moved;

-- 2. Audit-log continuity.
WITH moved AS (
    UPDATE audit_log a SET "resourceId" = m.linked_id
    FROM merge_map m
    WHERE a."resourceId" = m.seeded_id
      AND a."resourceType" = 'employee'
    RETURNING 1
) SELECT 'audit_log moved:' AS step, COUNT(*) AS rows FROM moved;

-- 3. Final sanity: no child still references the seeded employees.
SELECT 'STRAY child on seeded:' AS issue, tbl, ref
FROM (
    SELECT 'customer.collectorId'::TEXT AS tbl, "collectorId" AS ref FROM customer WHERE "collectorId" IN (SELECT seeded_id FROM merge_map)
    UNION ALL SELECT 'customer.worker_id', worker_id FROM customer WHERE worker_id IN (SELECT seeded_id FROM merge_map)
    UNION ALL SELECT 'cash_collection', "collectorId" FROM cash_collection WHERE "collectorId" IN (SELECT seeded_id FROM merge_map)
    UNION ALL SELECT 'payment.collectorId', "collectorId" FROM payment WHERE "collectorId" IN (SELECT seeded_id FROM merge_map)
    UNION ALL SELECT 'payment.workerId', "workerId" FROM payment WHERE "workerId" IN (SELECT seeded_id FROM merge_map)
    UNION ALL SELECT 'expense', "submittedById" FROM expense WHERE "submittedById" IN (SELECT seeded_id FROM merge_map)
    UNION ALL SELECT 'installation', "employeeId" FROM installation WHERE "employeeId" IN (SELECT seeded_id FROM merge_map)
    UNION ALL SELECT 'stock_log', "employeeId" FROM stock_log WHERE "employeeId" IN (SELECT seeded_id FROM merge_map)
    UNION ALL SELECT 'task_assignment', "employeeId" FROM task_assignment WHERE "employeeId" IN (SELECT seeded_id FROM merge_map)
    UNION ALL SELECT 'employee_station', "employeeId" FROM employee_station WHERE "employeeId" IN (SELECT seeded_id FROM merge_map)
    UNION ALL SELECT 'worker_stock', "employeeId" FROM worker_stock WHERE "employeeId" IN (SELECT seeded_id FROM merge_map)
) x;

-- 4. Delete the seeded employees. This frees the (org, email) and userId
--    UNIQUE keys we want to reassign to the linked twins.
WITH del AS (
    DELETE FROM employee WHERE id IN (SELECT seeded_id FROM merge_map) RETURNING 1
) SELECT 'seeded employees deleted:' AS step, COUNT(*) AS rows FROM del;

-- 5. Merge seeded values onto the linked twin (now that the unique keys
--    are free). Only fill where the linked is empty/default — do NOT
--    overwrite values pulled from iRadius.
UPDATE employee linked
SET
    name              = CASE WHEN linked.name IS NULL OR linked.name = '' OR linked.name = 'Unknown'
                              THEN s.s_name ELSE linked.name END,
    email             = COALESCE(linked.email, s.s_email),
    phone             = COALESCE(linked.phone, s.s_phone),
    username          = COALESCE(NULLIF(linked.username, ''), s.s_username),
    "telegram_chat_id"= COALESCE(linked."telegram_chat_id", s.s_telegram_chat_id),
    notes             = COALESCE(NULLIF(linked.notes, ''), s.s_notes),
    "userId"          = s.s_user_id
FROM seeded_snapshot s
WHERE linked.id = s.linked_id;

\echo 'final state for the two kept employees:'
SELECT id, name, username, email, "externalId", "userId",
    (SELECT COUNT(*) FROM customer c WHERE c."collectorId" = employee.id) AS customers,
    (SELECT COUNT(*) FROM cash_collection cc WHERE cc."collectorId" = employee.id) AS cash_collections
FROM employee
WHERE id IN ('cmoxdw7dl03ungl1kznk6k849', 'cmoxdw7dh03ulgl1kj7wj367c');

COMMIT;
