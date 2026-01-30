#!/bin/sh
# Migration script with retry logic for deployments
# The database may not be immediately reachable during pre-deploy phase

MAX_RETRIES=10
RETRY_DELAY=3
RETRY_COUNT=0

echo "Starting database migration with retry logic..."

# Check if database reset is requested
if [ "$RESET_DATABASE" = "true" ]; then
  echo "RESET_DATABASE=true detected. Resetting database schema..."

  # Reset the database schema using prisma
  pnpm --filter @repo/database db:reset-schema || {
    echo "Schema reset failed, continuing anyway..."
  }
fi

# Try to resolve any failed migrations first
echo "Checking for failed migrations..."
pnpm --filter @repo/database migrate:resolve 2>/dev/null || true

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "Attempt $RETRY_COUNT of $MAX_RETRIES..."

  # Run the migration
  pnpm --filter @repo/database migrate:deploy

  # Check if migration succeeded
  if [ $? -eq 0 ]; then
    echo "Migration completed successfully!"
    exit 0
  fi

  # If we haven't exceeded retries, wait and try again
  if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
    echo "Migration failed. Retrying in ${RETRY_DELAY}s..."
    sleep $RETRY_DELAY
    # Increase delay for next retry (exponential backoff, max 30s)
    RETRY_DELAY=$((RETRY_DELAY * 2))
    if [ $RETRY_DELAY -gt 30 ]; then
      RETRY_DELAY=30
    fi
  fi
done

echo "Migration failed after $MAX_RETRIES attempts"
exit 1
