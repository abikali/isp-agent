-- Restore pre-merge field values on dotnet2 linked customers where the
-- merge step in `cleanup-dotnet2-duplicates.sql` over-wrote them with the
-- xlsx seed values. The dealer never edited the address field — the seed
-- script auto-filled "AIN EBEL" for everyone — so iRadius's specific
-- per-customer addresses ("Imad Lallous Fiber", "Knisi 3ati2a Fiber", etc.)
-- are the correct values to keep.
--
-- The TSV at /tmp/pre_merge_linked.tsv was produced by parse-bk.py over the
-- pg_dump snapshot taken BEFORE the cleanup transaction ran.

BEGIN;

CREATE TEMP TABLE pre_merge_bk (
    id TEXT PRIMARY KEY,
    address TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    mobile TEXT,
    phones TEXT,
    latitude TEXT,
    longitude TEXT
);

\copy pre_merge_bk FROM '/tmp/pre_merge_linked.tsv'

\echo 'rows loaded:'
SELECT COUNT(*) FROM pre_merge_bk;

\echo 'distinct customer addresses about to change:'
SELECT COUNT(*) FROM pre_merge_bk b
JOIN customer c ON c.id = b.id
WHERE coalesce(c.address,'') <> coalesce(NULLIF(b.address,''),'');

\echo 'sample of restorations:'
SELECT c."externalId", c.address AS post_merge, b.address AS pre_merge
FROM pre_merge_bk b
JOIN customer c ON c.id = b.id
WHERE c.address = 'AIN EBEL'
  AND coalesce(b.address,'') <> 'AIN EBEL'
LIMIT 10;

-- Restore: only address, since that's what the merge clobbered with the
-- generic xlsx default. firstName/lastName/mobile improvements from the
-- merge are kept (split names, etc.).
WITH updated AS (
    UPDATE customer c
    SET address = NULLIF(b.address, '')
    FROM pre_merge_bk b
    WHERE c.id = b.id
      AND c."organizationId" = 'otoo1g7z3b3e9mai4p3snchd'
      AND coalesce(c.address,'') <> coalesce(NULLIF(b.address,''),'')
    RETURNING 1
) SELECT 'addresses restored:' AS step, COUNT(*) AS rows FROM updated;

-- Restore latitude/longitude where the pre-merge had a value but the merge
-- nulled it (rare — only matters for the customers our location-request
-- flow had captured coordinates for).
WITH updated AS (
    UPDATE customer c
    SET latitude  = b.latitude::double precision,
        longitude = b.longitude::double precision
    FROM pre_merge_bk b
    WHERE c.id = b.id
      AND c."organizationId" = 'otoo1g7z3b3e9mai4p3snchd'
      AND b.latitude  IS NOT NULL AND b.latitude  <> ''
      AND b.longitude IS NOT NULL AND b.longitude <> ''
      AND (c.latitude  IS NULL OR c.longitude IS NULL
           OR c.latitude::text  <> b.latitude
           OR c.longitude::text <> b.longitude)
    RETURNING 1
) SELECT 'coords restored:' AS step, COUNT(*) AS rows FROM updated;

\echo 'POST-restore: how many dotnet2 customers still show "AIN EBEL"?'
SELECT COUNT(*) FROM customer
WHERE "organizationId" = 'otoo1g7z3b3e9mai4p3snchd'
  AND upper(address) IN ('AIN EBEL','AIN-EBEL','AINEBEL');

COMMIT;
