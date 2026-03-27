-- Normalize user emails so case-only variants can't coexist.
UPDATE "user"
SET email = lower(trim(email))
WHERE email <> lower(trim(email));

-- Keep the oldest auth account for each provider/account key.
WITH ranked_provider_account AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY "providerId", "accountId"
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM account
)
DELETE FROM account a
USING ranked_provider_account r
WHERE a.id = r.id
  AND r.rn > 1;

-- Keep only one account per user/provider as a second line of defense.
WITH ranked_user_provider AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY "userId", "providerId"
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM account
)
DELETE FROM account a
USING ranked_user_provider r
WHERE a.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "user_email_lower_unique"
ON "user"(lower(email));

CREATE UNIQUE INDEX IF NOT EXISTS "account_providerId_accountId_key"
ON account("providerId", "accountId");

CREATE UNIQUE INDEX IF NOT EXISTS "account_userId_providerId_key"
ON account("userId", "providerId");
