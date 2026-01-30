import { test as base, expect } from "@playwright/test";

/**
 * Test user credentials for e2e tests
 * These should match test accounts in the development database
 */
export const TEST_USER = {
	email: "test@example.com",
	password: "TestPassword123!",
	name: "Test User",
};

export const TEST_USER_2 = {
	email: "test2@example.com",
	password: "TestPassword123!",
	name: "Test User 2",
};

export const TEST_ORGANIZATION = {
	name: "Test Organization",
	slug: "test-org",
};

/**
 * Extended test fixture with authentication helpers
 */
export const test = base.extend<{
	authenticatedPage: ReturnType<typeof base.extend>;
}>({
	authenticatedPage: async ({ page }, use) => {
		// Login before test
		await page.goto("/login");
		await page.waitForLoadState("networkidle");
		await page
			.getByRole("textbox", { name: /^email$/i })
			.fill(TEST_USER.email);
		await page.locator("input#password").fill(TEST_USER.password);
		await page
			.getByRole("button", { name: "Sign in", exact: true })
			.click();

		// Wait for redirect to dashboard
		await page.waitForURL(/\/app\//);

		await use(page);
	},
});

export { expect };

/**
 * Helper to generate unique test data
 */
export function generateTestData(prefix: string) {
	const timestamp = Date.now();
	return {
		name: `${prefix} ${timestamp}`,
		email: `${prefix.toLowerCase().replace(/\s/g, "-")}-${timestamp}@test.com`,
		username: `${prefix.toLowerCase().replace(/\s/g, "-")}-${timestamp}`,
	};
}

/**
 * Helper to wait for network to be idle (useful after form submissions)
 */
export async function waitForNetworkIdle(
	page: ReturnType<typeof base.extend>,
	timeout = 5000,
) {
	await page.waitForLoadState("networkidle", { timeout });
}

/**
 * Helper to dismiss any toast notifications
 */
export async function dismissToasts(page: ReturnType<typeof base.extend>) {
	const toasts = page.locator("[data-sonner-toast]");
	const count = await toasts.count();
	for (let i = 0; i < count; i++) {
		await toasts
			.nth(i)
			.click()
			.catch(() => {});
	}
}

/**
 * Helper to wait for a toast message
 */
export async function waitForToast(
	page: ReturnType<typeof base.extend>,
	message: string | RegExp,
) {
	const toast = page
		.locator("[data-sonner-toast]")
		.filter({ hasText: message });
	await expect(toast).toBeVisible({ timeout: 10000 });
	return toast;
}
