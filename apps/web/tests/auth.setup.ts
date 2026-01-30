import fs from "node:fs";
import path from "node:path";
import { test as setup } from "@playwright/test";

const AUTH_FILE = path.join(import.meta.dirname, ".auth/user.json");

/**
 * Auth Setup - Runs once before all tests to create authenticated session state
 *
 * This eliminates the need for each test to login, significantly reducing:
 * - HTTP requests to the auth endpoints
 * - Server load during test runs
 * - Test execution time
 */
setup("authenticate", async ({ page }) => {
	// Ensure .auth directory exists
	const authDir = path.dirname(AUTH_FILE);
	if (!fs.existsSync(authDir)) {
		fs.mkdirSync(authDir, { recursive: true });
	}

	// Navigate to login page
	await page.goto("/login");
	await page.waitForLoadState("networkidle");

	// Fill in credentials
	await page
		.getByRole("textbox", { name: /^email$/i })
		.fill("test@example.com");
	await page.locator("input#password").fill("TestPassword123!");

	// Submit login form (use exact match to avoid matching "Sign in with passkey" button)
	await page.getByRole("button", { name: "Sign in", exact: true }).click();

	// Wait for successful redirect to dashboard
	await page.waitForURL(/\/app\//, { timeout: 30000 });

	// Save authentication state
	await page.context().storageState({ path: AUTH_FILE });
});
