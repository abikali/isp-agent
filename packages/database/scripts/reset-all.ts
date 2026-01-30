/**
 * Reset script that clears both the database and Redis sessions.
 *
 * This ensures that after a database reset, there are no stale sessions
 * in Redis pointing to users that no longer exist.
 *
 * Usage: pnpm --filter @repo/database reset
 */

import { execSync } from "node:child_process";
import { createClient } from "redis";

// biome-ignore lint/suspicious/noConsole: CLI script requires console output
const log = console.log.bind(console);
// biome-ignore lint/suspicious/noConsole: CLI script requires console output
const logError = console.error.bind(console);

async function main() {
	const redisUrl = process.env["REDIS_URL"] || "redis://localhost:6379";

	log("🗑️  Resetting database and Redis...\n");

	// Step 1: Reset database with Prisma
	log("📦 Resetting database with Prisma migrate reset...");
	try {
		execSync(
			"prisma migrate reset --force --schema=./prisma/schema.prisma",
			{
				stdio: "inherit",
				cwd: process.cwd(),
			},
		);
		log("✅ Database reset complete\n");
	} catch (error) {
		logError("❌ Database reset failed:", error);
		process.exit(1);
	}

	// Step 2: Flush Redis completely
	log("🔴 Flushing Redis...");
	try {
		const redis = createClient({ url: redisUrl });
		await redis.connect();

		// Flush the entire database to ensure all session data is cleared
		// Pattern matching doesn't reliably catch all Better Auth session keys
		await redis.flushDb();
		log("   Flushed all Redis data");

		await redis.quit();
		log("✅ Redis flushed\n");
	} catch (error) {
		logError("⚠️  Redis flush failed (non-fatal):", error);
		log("   You may need to manually run: redis-cli FLUSHDB\n");
	}

	log("🎉 Reset complete! All sessions have been invalidated.");
	log("   Users will need to log in again.");
}

main().catch(logError);
