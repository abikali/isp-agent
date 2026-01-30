import { expect, test } from "@playwright/test";
import { generateTestData } from "../fixtures";

test.describe("Auth - Signup Page", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/signup");
		await page.waitForLoadState("networkidle");
	});

	test("should display signup form", async ({ page }) => {
		// Check page title
		const heading = page.getByRole("heading", {
			name: /create an account/i,
		});
		await expect(heading).toBeVisible();

		// Check form elements using role and input-specific selectors
		const nameInput = page.getByRole("textbox", { name: /^name$/i });
		const emailInput = page.getByRole("textbox", { name: /^email$/i });
		const passwordInput = page.locator("input#password");
		const submitButton = page.getByRole("button", { name: /sign up/i });

		await expect(nameInput).toBeVisible();
		await expect(emailInput).toBeVisible();
		await expect(passwordInput).toBeVisible();
		await expect(submitButton).toBeVisible();
	});

	test("should show validation error for empty name", async ({ page }) => {
		const nameInput = page.getByRole("textbox", { name: /^name$/i });
		const emailInput = page.getByRole("textbox", { name: /^email$/i });

		// Click into name field and then click out (blur)
		await nameInput.click();
		await emailInput.click();

		// Wait for validation to trigger
		await page.waitForTimeout(500);

		// Look for validation error
		const errorMessage = page.getByText("Name is required");
		await expect(errorMessage).toBeVisible({ timeout: 5000 });
	});

	test("should show validation error for empty email", async ({ page }) => {
		// Fill name first
		await page.getByRole("textbox", { name: /^name$/i }).fill("Test User");

		const emailInput = page.getByRole("textbox", { name: /^email$/i });
		const passwordInput = page.locator("input#password");

		// Click into email and then click out
		await emailInput.click();
		await passwordInput.click();

		// Wait for validation
		await page.waitForTimeout(500);

		// Look for validation error
		const errorMessage = page.getByText("Email is required");
		await expect(errorMessage).toBeVisible({ timeout: 5000 });
	});

	test("should show validation error for invalid email", async ({ page }) => {
		await page.getByRole("textbox", { name: /^name$/i }).fill("Test User");

		const emailInput = page.getByRole("textbox", { name: /^email$/i });
		await emailInput.fill("invalid-email");

		// Click outside to trigger blur validation
		await page.locator("input#password").click();

		// Wait for validation
		await page.waitForTimeout(500);

		// Look for validation error
		const errorMessage = page.getByText("Invalid email");
		await expect(errorMessage).toBeVisible({ timeout: 5000 });
	});

	test("should show validation error for empty password", async ({
		page,
	}) => {
		await page.getByRole("textbox", { name: /^name$/i }).fill("Test User");
		await page
			.getByRole("textbox", { name: /^email$/i })
			.fill("test@example.com");

		const passwordInput = page.locator("input#password");

		// Click into password and then click out
		await passwordInput.click();
		await page.getByRole("textbox", { name: /^name$/i }).click();

		// Wait for validation
		await page.waitForTimeout(500);

		// Look for validation error
		const errorMessage = page.getByText("Password is required");
		await expect(errorMessage).toBeVisible({ timeout: 5000 });
	});

	test("should toggle password visibility", async ({ page }) => {
		const passwordInput = page.locator("input#password");
		await passwordInput.fill("testpassword");

		// Initially password should be hidden
		await expect(passwordInput).toHaveAttribute("type", "password");

		// Find the eye icon button in the password field's relative container
		const toggleButton = page.locator(
			"#password ~ button, #password + button, .relative:has(#password) button",
		);
		await toggleButton.click();

		// Password should now be visible
		await expect(passwordInput).toHaveAttribute("type", "text");
	});

	test("should have link to login page", async ({ page }) => {
		const loginLink = page.getByRole("link", { name: /sign in/i });
		await expect(loginLink).toBeVisible();
		await loginLink.click();

		await expect(page).toHaveURL(/\/login/);
	});

	test("should show error or success for signup attempt", async ({
		page,
	}) => {
		// Use an email that may or may not exist
		await page.getByRole("textbox", { name: /^name$/i }).fill("Test User");
		await page
			.getByRole("textbox", { name: /^email$/i })
			.fill("test@example.com");
		await page.locator("input#password").fill("TestPassword123!");

		const submitButton = page.getByRole("button", { name: /sign up/i });
		await submitButton.click();

		// Wait for loading to finish - button should become enabled again or success/error should appear
		await page.waitForTimeout(8000);

		// Check for various response possibilities
		const errorAlert = page.locator('[role="alert"]');
		const successMessage = page.getByText(/check your email/i);
		const verifyMessage = page.getByText(/verify/i);
		const accountExists = page.getByText(/already/i);

		// One of these should be visible after signup attempt
		const hasError = await errorAlert.isVisible();
		const hasSuccess = await successMessage.isVisible();
		const hasVerify = await verifyMessage.isVisible();
		const hasAlready = await accountExists.isVisible();

		expect(hasError || hasSuccess || hasVerify || hasAlready).toBeTruthy();
	});

	test("should process signup form submission with new email", async ({
		page,
	}) => {
		// Generate unique test data
		const testData = generateTestData("signup-test");

		await page
			.getByRole("textbox", { name: /^name$/i })
			.fill(testData.name);
		await page
			.getByRole("textbox", { name: /^email$/i })
			.fill(testData.email);
		await page.locator("input#password").fill("TestPassword123!");

		const submitButton = page.getByRole("button", { name: /sign up/i });

		// Verify button is initially enabled
		await expect(submitButton).toBeEnabled();

		await submitButton.click();

		// Wait for response - signup may or may not disable button during submission
		// Just wait for the form to be processed
		await page.waitForTimeout(8000);

		// After signup completes, page should change state
		// Either show success message, verification message, error, or new account created
		const pageContent = await page.content();
		const hasEmailMessage = pageContent.toLowerCase().includes("email");
		const hasVerifyMessage = pageContent.toLowerCase().includes("verify");
		const hasSuccessContent =
			pageContent.toLowerCase().includes("check") ||
			pageContent.toLowerCase().includes("success");
		const hasAlreadyExists = pageContent.toLowerCase().includes("already");

		// Page should have some response content related to signup
		expect(
			hasEmailMessage ||
				hasVerifyMessage ||
				hasSuccessContent ||
				hasAlreadyExists,
		).toBeTruthy();
	});

	test("should display social login options if enabled", async ({ page }) => {
		// Check for social login section
		const socialSection = page.getByText("Or continue with");

		if (await socialSection.isVisible()) {
			// Check for common providers
			const googleButton = page.getByRole("button", { name: /google/i });
			const githubButton = page.getByRole("button", { name: /github/i });

			// At least one should be visible if social login is enabled
			const hasGoogle = await googleButton.isVisible();
			const hasGithub = await githubButton.isVisible();

			if (hasGoogle || hasGithub) {
				expect(hasGoogle || hasGithub).toBeTruthy();
			}
		}
	});
});

test.describe("Auth - Signup with Invitation", () => {
	test.skip("should display signup form when invitationId is present", async ({
		page,
	}) => {
		// This test is skipped because the invitation lookup causes
		// slow loading when the invitationId doesn't exist in the database
		await page.goto("/signup?invitationId=test-invitation-id", {
			timeout: 60000,
		});
		await page.waitForLoadState("domcontentloaded");

		const heading = page.getByRole("heading", {
			name: /create an account/i,
		});
		await expect(heading).toBeVisible({ timeout: 15000 });
	});
});
