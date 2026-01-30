/**
 * Playwright Global Setup - Seeds test database with required test data
 *
 * Strategy:
 * 1. Sign up users via HTTP API (creates unverified users)
 * 2. Connect directly to PostgreSQL to set emailVerified = true
 * 3. Create organization and membership via HTTP API
 *
 * Optional: Start a tunnel for webhook testing (E2E_USE_TUNNEL=true)
 */
import pg from "pg";
import { isTunnelEnabled, startTunnel } from "./lib/tunnel";

const BASE_URL = "http://localhost:3030";
const TEST_PASSWORD = "TestPassword123!";

function log(message: string): void {
	process.stdout.write(`${message}\n`);
}

/**
 * Try to login with given credentials
 * Returns true if login succeeds, false otherwise
 */
async function tryLogin(email: string, password: string): Promise<boolean> {
	try {
		const response = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: BASE_URL,
			},
			body: JSON.stringify({ email, password }),
		});

		return response.ok;
	} catch {
		return false;
	}
}

async function signUpUser(
	email: string,
	name: string,
	password: string,
): Promise<boolean> {
	try {
		const response = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: BASE_URL,
			},
			body: JSON.stringify({ email, name, password }),
		});

		if (response.ok) {
			log(`✓ Signed up user: ${email}`);
			return true;
		}

		// Check if user already exists (will fail with error)
		const text = await response.text();
		if (text.includes("exist") || text.includes("already")) {
			log(`✓ User already exists: ${email}`);
			return true;
		}

		log(`⚠ Signup response for ${email}: ${text}`);
		return false;
	} catch (error) {
		log(`⚠ Error signing up ${email}: ${error}`);
		return false;
	}
}

async function resetTestUsersInDatabase(): Promise<void> {
	const databaseUrl = process.env["DATABASE_URL"];
	if (!databaseUrl) {
		log("⚠ DATABASE_URL not set, skipping user reset");
		return;
	}

	const client = new pg.Client({ connectionString: databaseUrl });

	try {
		await client.connect();

		// Delete test users to ensure fresh signup with correct password
		// This cascades to accounts, sessions, etc.
		const result = await client.query(
			`DELETE FROM "user" WHERE email IN ($1, $2) RETURNING email`,
			["test@example.com", "test2@example.com"],
		);

		if (result.rowCount && result.rowCount > 0) {
			log(`✓ Reset ${result.rowCount} test users for fresh signup`);
		}
	} catch (error) {
		log(`⚠ Error resetting users: ${error}`);
	} finally {
		await client.end();
	}
}

async function verifyUsersInDatabase(): Promise<void> {
	const databaseUrl = process.env["DATABASE_URL"];
	if (!databaseUrl) {
		log("⚠ DATABASE_URL not set, skipping email verification");
		return;
	}

	const client = new pg.Client({ connectionString: databaseUrl });

	try {
		await client.connect();

		// Set emailVerified = true and onboardingComplete = true for test users
		const result = await client.query(
			`UPDATE "user" SET "emailVerified" = true, "onboardingComplete" = true WHERE email IN ($1, $2) RETURNING email`,
			["test@example.com", "test2@example.com"],
		);

		log(
			`✓ Verified and completed onboarding for ${result.rowCount} users in database`,
		);
	} catch (error) {
		log(`⚠ Error verifying users: ${error}`);
	} finally {
		await client.end();
	}
}

async function createOrganizationViaApi(): Promise<void> {
	// Always use SQL to ensure organization and membership exist
	// This is more reliable than API calls since we reset users each run
	await createOrganizationInDatabase();
}

async function createOrganizationInDatabase(): Promise<void> {
	const databaseUrl = process.env["DATABASE_URL"];
	if (!databaseUrl) {
		log("⚠ DATABASE_URL not set, skipping organization creation");
		return;
	}

	const client = new pg.Client({ connectionString: databaseUrl });

	try {
		await client.connect();

		// Get test user ID
		const userResult = await client.query(
			`SELECT id FROM "user" WHERE email = $1`,
			["test@example.com"],
		);

		if (userResult.rows.length === 0) {
			log("⚠ Test user not found in database");
			return;
		}

		const userId = userResult.rows[0].id;

		// Check if organization already exists
		const existingOrg = await client.query(
			"SELECT id FROM organization WHERE slug = $1",
			["test-org"],
		);

		let orgId: string;

		if (existingOrg.rows.length > 0) {
			orgId = existingOrg.rows[0].id;
			log("✓ Organization already exists: test-org (SQL)");
		} else {
			// Create organization with cuid-like ID
			const newOrgId = `org_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
			await client.query(
				`INSERT INTO organization (id, name, slug, "createdAt") VALUES ($1, $2, $3, NOW())`,
				[newOrgId, "Test Organization", "test-org"],
			);
			orgId = newOrgId;
			log("✓ Created organization: test-org (SQL)");
		}

		// Check if user is already a member
		const existingMember = await client.query(
			`SELECT id FROM member WHERE "organizationId" = $1 AND "userId" = $2`,
			[orgId, userId],
		);

		if (existingMember.rows.length === 0) {
			// Add user as owner
			const memberId = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
			await client.query(
				`INSERT INTO member (id, "organizationId", "userId", role, "createdAt") VALUES ($1, $2, $3, $4, NOW())`,
				[memberId, orgId, userId, "owner"],
			);
			log("✓ Added test user as organization owner (SQL)");
		} else {
			log("✓ Test user is already an organization member (SQL)");
		}
	} catch (error) {
		log(`⚠ Error creating organization: ${error}`);
	} finally {
		await client.end();
	}
}

async function globalSetup() {
	log("\n🔧 Setting up test data...\n");

	// Optional: Start tunnel for webhook testing
	if (isTunnelEnabled()) {
		try {
			const tunnelUrl = await startTunnel(3030);
			// Set environment variable so the web server uses the tunnel URL
			// This allows Firecrawl webhooks to reach the local server
			process.env["VITE_SITE_URL"] = tunnelUrl;
			process.env["BETTER_AUTH_URL"] = tunnelUrl;
			log(`✓ Tunnel started: ${tunnelUrl}`);
		} catch (error) {
			log(`⚠ Failed to start tunnel: ${error}`);
			log("  Webhook tests may not work without tunnel");
		}
	}

	// Step 0: Check if test users can login (skip reset if they already exist with correct password)
	// This avoids sending signup emails on every test run
	const canLogin = await tryLogin("test@example.com", TEST_PASSWORD);

	if (canLogin) {
		log(
			"✓ Test user already exists with correct password - skipping signup",
		);
	} else {
		// User doesn't exist or has wrong password - reset and recreate
		log("⚠ Test user cannot login - resetting and recreating");
		await resetTestUsersInDatabase();

		// Sign up users via HTTP
		await signUpUser("test@example.com", "Test User", TEST_PASSWORD);
		await signUpUser("test2@example.com", "Test User 2", TEST_PASSWORD);
	}

	// Step 1: Verify users and complete onboarding directly in database
	// (always run to ensure emailVerified and onboardingComplete are set)
	await verifyUsersInDatabase();

	// Step 2: Create organization and membership via SQL
	await createOrganizationViaApi();

	log("\n✓ Test data setup complete\n");
}

export default globalSetup;
