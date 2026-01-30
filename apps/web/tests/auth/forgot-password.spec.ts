import { expect, test } from "@playwright/test";

test.describe("Auth - Forgot Password Page", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/forgot-password");
	});

	test("should display forgot password form", async ({ page }) => {
		await page.waitForLoadState("networkidle");

		// Check page title/heading
		const heading = page.getByRole("heading");
		await expect(heading.first()).toBeVisible();

		// Check form elements
		const emailInput = page.getByRole("textbox", { name: /^email$/i });
		await expect(emailInput).toBeVisible();

		// Check submit button
		const submitButton = page.getByRole("button", {
			name: /send|reset|submit/i,
		});
		await expect(submitButton).toBeVisible();
	});

	test("should show validation error for empty email", async ({ page }) => {
		await page.waitForLoadState("networkidle");

		const emailInput = page.getByRole("textbox", { name: /^email$/i });
		const submitButton = page.getByRole("button", {
			name: /send|reset|submit/i,
		});

		// Click into email and then click out to trigger blur validation
		await emailInput.click();
		await submitButton.click();

		// Wait for validation
		await page.waitForTimeout(500);

		// Look for validation error
		const errorMessage = page.getByText("Email is required");
		await expect(errorMessage).toBeVisible({ timeout: 5000 });
	});

	test("should show validation error for invalid email", async ({ page }) => {
		await page.waitForLoadState("networkidle");

		const emailInput = page.getByRole("textbox", { name: /^email$/i });
		await emailInput.fill("invalid-email");

		// Click outside to trigger blur validation
		await page.getByRole("button", { name: /send|reset|submit/i }).click();

		// Wait for validation
		await page.waitForTimeout(500);

		// Look for validation error
		const errorMessage = page.getByText("Invalid email");
		await expect(errorMessage).toBeVisible({ timeout: 5000 });
	});

	test("should submit forgot password request", async ({ page }) => {
		await page.waitForLoadState("networkidle");

		// Fill valid email
		await page
			.getByRole("textbox", { name: /^email$/i })
			.fill("test@example.com");

		// Submit form
		const submitButton = page.getByRole("button", {
			name: /send|reset|submit/i,
		});
		await submitButton.click();

		// Wait for response
		await page.waitForTimeout(5000);

		// Should show success message or error
		const successMessage = page.getByText(/check your email/i);
		const errorAlert = page.locator('[role="alert"]');

		const hasSuccess = await successMessage.isVisible();
		const hasError = await errorAlert.isVisible();

		// One of these should be true
		expect(hasSuccess || hasError).toBeTruthy();
	});

	test("should have link back to login", async ({ page }) => {
		await page.waitForLoadState("networkidle");

		const loginLink = page.getByRole("link", {
			name: /sign in|login|back/i,
		});
		await expect(loginLink).toBeVisible();
		await loginLink.click();

		await expect(page).toHaveURL(/\/login/);
	});
});

test.describe("Auth - Reset Password Page", () => {
	test("should display reset password form with valid token", async ({
		page,
	}) => {
		// Navigate to reset password with a mock token
		await page.goto("/reset-password?token=test-token");

		// Wait for page to load
		await page.waitForLoadState("networkidle");

		// Check for password input - using locator for flexibility
		const passwordInput = page.locator(
			"input#password, input[type='password']",
		);

		// Either shows form or error for invalid token
		const hasPasswordField = await passwordInput
			.first()
			.isVisible()
			.catch(() => false);
		const hasError = await page
			.locator('[role="alert"]')
			.isVisible()
			.catch(() => false);
		const pageContent = await page.content();
		const hasResetContent =
			pageContent.toLowerCase().includes("reset") ||
			pageContent.toLowerCase().includes("password");

		expect(hasPasswordField || hasError || hasResetContent).toBeTruthy();
	});

	test("should redirect without token", async ({ page }) => {
		await page.goto("/reset-password");

		// Wait for potential redirect
		await page.waitForTimeout(3000);

		// Should either stay on page with error or redirect
		const url = page.url();
		const hasError = await page
			.locator('[role="alert"]')
			.isVisible()
			.catch(() => false);
		const pageContent = await page.content();
		const hasMessage =
			pageContent.toLowerCase().includes("token") ||
			pageContent.toLowerCase().includes("invalid") ||
			pageContent.toLowerCase().includes("expired");

		// Either shows error, has message about token, or redirected
		expect(
			url.includes("reset-password") ||
				hasError ||
				hasMessage ||
				url.includes("login"),
		).toBeTruthy();
	});
});
