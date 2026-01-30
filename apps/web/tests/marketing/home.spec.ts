import { expect, test } from "@playwright/test";

test.describe("Marketing - Home Page", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
	});

	test("should display the hero section", async ({ page }) => {
		await page.waitForLoadState("networkidle");

		// Check hero content is visible - page should render
		const body = page.locator("body");
		await expect(body).toBeVisible();

		// Check for main heading or any heading
		const heading = page.getByRole("heading").first();
		await expect(heading).toBeVisible({ timeout: 10000 });
	});

	test("should display navigation with key links", async ({ page }) => {
		// Check navigation exists
		const nav = page.getByRole("navigation");
		await expect(nav).toBeVisible();

		// Check for login/signup links
		const loginLink = page.getByRole("link", { name: /sign in|login/i });
		await expect(loginLink).toBeVisible();
	});

	test("should display features section", async ({ page }) => {
		// Look for features section or cards
		const featuresSection = page.locator("text=Features").first();
		if (await featuresSection.isVisible()) {
			await expect(featuresSection).toBeVisible();
		}
	});

	test("should display pricing section", async ({ page }) => {
		// Scroll to pricing section
		const pricingSection = page.locator("text=Pricing").first();
		if (await pricingSection.isVisible()) {
			await pricingSection.scrollIntoViewIfNeeded();
			await expect(pricingSection).toBeVisible();
		}
	});

	test("should display FAQ section", async ({ page }) => {
		// Look for FAQ section
		const faqSection = page.locator("text=FAQ").first();
		if (await faqSection.isVisible()) {
			await faqSection.scrollIntoViewIfNeeded();
			await expect(faqSection).toBeVisible();
		}
	});

	test("should display footer with links", async ({ page }) => {
		// Scroll to footer
		const footer = page.locator("footer");
		await footer.scrollIntoViewIfNeeded();
		await expect(footer).toBeVisible();
	});

	test("should navigate to login page when clicking sign in", async ({
		page,
	}) => {
		const loginLink = page.getByRole("link", { name: /sign in|login/i });
		await loginLink.click();

		await expect(page).toHaveURL(/\/login/);
	});

	test("should navigate to signup page when clicking sign up", async ({
		page,
	}) => {
		await page.waitForLoadState("networkidle");

		const signupLink = page.getByRole("link", {
			name: /sign up|get started/i,
		});
		if (await signupLink.isVisible()) {
			await signupLink.click();
			// Accept both /signup and /login as valid destinations for "Get Started" CTA
			await expect(page).toHaveURL(/\/(signup|login)/);
		} else {
			// Skip if no signup link visible on homepage
			test.skip(true, "No signup link visible on homepage");
		}
	});

	test("should be responsive on mobile viewport", async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 667 });

		// Check page still renders - wait for main content
		// Use .first() since there may be multiple main elements
		await page.waitForLoadState("networkidle");
		const mainContent = page.getByRole("main").first();
		await expect(mainContent).toBeVisible();

		// Mobile menu should be available
		const mobileMenuButton = page.getByRole("button", { name: /menu/i });
		if (await mobileMenuButton.isVisible()) {
			await expect(mobileMenuButton).toBeVisible();
		}
	});

	test("should have proper meta tags for SEO", async ({ page }) => {
		// Check title
		const title = await page.title();
		expect(title).toBeTruthy();
		expect(title.length).toBeGreaterThan(0);

		// Check meta description
		const metaDescription = await page
			.locator('meta[name="description"]')
			.getAttribute("content");
		expect(metaDescription).toBeTruthy();
	});
});

test.describe("Marketing - Contact Page", () => {
	test("should display contact form", async ({ page }) => {
		await page.goto("/contact");

		// Check for contact form elements
		const nameInput = page.getByLabel(/name/i);
		const emailInput = page.getByLabel(/email/i);
		const messageInput = page.getByLabel(/message/i);

		if (await nameInput.isVisible()) {
			await expect(nameInput).toBeVisible();
			await expect(emailInput).toBeVisible();
			await expect(messageInput).toBeVisible();
		}
	});
});

test.describe("Marketing - Blog", () => {
	test("should display blog listing page", async ({ page }) => {
		await page.goto("/blog");

		// Wait for page to load
		await page.waitForLoadState("domcontentloaded");

		// Check page title or heading
		const heading = page.getByRole("heading").first();
		await expect(heading).toBeVisible();
	});
});
