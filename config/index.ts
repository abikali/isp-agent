import type { Config } from "./types";

export const config = {
	appName: "LibanCom",
	// Rate Limiting
	rateLimit: {
		enabled: true,
		// Use Redis for distributed rate limiting (recommended for production)
		// Falls back to memory store if Redis URL is not available
		store: "redis" as const,
		redis: {
			url: process.env["REDIS_URL"] ?? "",
		},
		limits: {
			api: { window: 60000, max: 100 }, // 100 requests per minute
			auth: { window: 300000, max: 10 }, // 10 attempts per 5 minutes
			upload: { window: 3600000, max: 50 }, // 50 uploads per hour
			webhook: { window: 60000, max: 30 }, // 30 webhooks per minute
		},
	},
	// Background Jobs
	jobs: {
		enabled: process.env["JOBS_ENABLED"] !== "false",
		redis: {
			url: process.env["REDIS_URL"] ?? "redis://localhost:6379",
		},
		workers: {
			email: { concurrency: 5 },
			webhook: { concurrency: 10 },
			scheduled: { concurrency: 1 },
		},
	},
	// Security
	security: {
		failedLogin: {
			enabled: true,
			baseDelayMs: 1000, // 1 second base delay
			maxDelayMs: 30000, // 30 seconds max delay
			delayMultiplier: 2, // Exponential backoff multiplier
		},
		accountLockout: {
			enabled: true,
			maxFailedAttempts: 5, // Lock after 5 failed attempts
			lockoutDurationMinutes: 30, // Lock for 30 minutes
			notifyOnLockout: true, // Send email when account is locked
		},
		deviceTracking: {
			enabled: true,
			notifyNewDevice: true, // Send email on new device login
			maxKnownDevices: 10, // Keep track of last 10 devices
		},
	},
	// Integrations (Nango - supports self-hosted)
	integrations: {
		enabled: true,
		nango: {
			secretKey: process.env["NANGO_SECRET_KEY"] ?? "",
			publicKey: process.env["NANGO_PUBLIC_KEY"] ?? "",
			// Self-hosted Nango URL (leave empty for Nango Cloud)
			host: process.env["NANGO_HOST"] ?? "",
		},
	},
	// Internationalization
	i18n: {
		// Whether internationalization should be enabled (if disabled, you still need to define the locale you want to use below and set it as the default locale)
		enabled: true,
		// Define all locales here that should be available in the app
		// You need to define a label that is shown in the language selector and a currency that should be used for pricing with this locale
		locales: {
			en: {
				currency: "USD",
				label: "English",
			},
			de: {
				currency: "USD",
				label: "Deutsch",
			},
		},
		// The default locale is used if no locale is provided
		defaultLocale: "en",
		// The default currency is used for pricing if no currency is provided
		defaultCurrency: "USD",
		// The name of the cookie that is used to determine the locale
		localeCookieName: "LOCALE",
	},
	// Organizations
	organizations: {
		// Whether organizations are enabled in general
		enable: true,
		// Whether billing for organizations should be enabled (below you can enable it for users instead)
		enableBilling: true,
		// Whether the organization should be hidden from the user (use this for multi-tenant applications)
		hideOrganization: false,
		// Should users be able to create new organizations? Otherwise only admin users can create them
		enableUsersToCreateOrganizations: true,
		// Whether users should be required to be in an organization. This will redirect users to the organization page after sign in
		requireOrganization: true,
		// Define forbidden organization slugs. Make sure to add all paths that you define as a route after /app/... to avoid routing issues
		forbiddenOrganizationSlugs: [
			"new-organization",
			"admin",
			"settings",
			"ai-demo",
			"organization-invitation",
		],
	},
	// Users
	users: {
		// Whether billing should be enabled for users (above you can enable it for organizations instead)
		enableBilling: false,
		// Whether you want the user to go through an onboarding form after signup (can be defined in the OnboardingForm.tsx)
		enableOnboarding: true,
	},
	// Authentication
	auth: {
		// Whether users should be able to create accounts (otherwise users can only be by admins)
		enableSignup: true,
		// Whether users should be able to sign in with a magic link
		enableMagicLink: true,
		// Whether users should be able to sign in with a social provider
		enableSocialLogin: true,
		// Whether users should be able to sign in with a passkey
		enablePasskeys: true,
		// Whether users should be able to sign in with a password
		enablePasswordLogin: true,
		// Whether users should be activate two factor authentication
		enableTwoFactor: true,
		// where users should be redirected after the sign in
		redirectAfterSignIn: "/app",
		// where users should be redirected after logout
		redirectAfterLogout: "/login",
		// how long a session should be valid
		sessionCookieMaxAge: 60 * 60 * 24 * 30,
	},
	// Mails
	mails: {
		// the from address for mails (configurable via env for dev/prod domains)
		from: process.env["MAIL_FROM"] || "noreply@libancom.co",
	},
	// Frontend
	ui: {
		// the themes that should be available in the app
		enabledThemes: ["light", "dark"],
		// the default theme
		defaultTheme: "light",
		// the saas part of the application
		saas: {
			// whether the saas part should be enabled (otherwise all routes will be redirect to the marketing page)
			enabled: true,
			// whether the sidebar layout should be used
			useSidebarLayout: true,
		},
		// the marketing part of the application
		marketing: {
			// whether the marketing features should be enabled (otherwise all routes will be redirect to the saas part)
			enabled: true,
		},
	},
	// Storage
	storage: {
		// define the name of the buckets for the different types of files
		bucketNames: {
			avatars: process.env["AVATARS_BUCKET_NAME"] ?? "libancom-dev",
		},
	},
	contactForm: {
		// whether the contact form should be enabled
		enabled: true,
		// the email to which the contact form messages should be sent
		to: "hello@libancom.co",
		// the subject of the email
		subject: "Contact form message",
	},
	// Payments
	payments: {
		// define the products that should be available in the checkout
		plans: {
			// The free plan is treated differently. It will automatically be assigned if the user has no other plan.
			free: {
				isFree: true,
				limits: {
					members: 3,
					projects: 1,
					apiCalls: 1000,
					storage: 100, // 100 MB
				},
			},
			pro: {
				recommended: true,
				limits: {
					members: 10,
					projects: 10,
					apiCalls: 10000,
					storage: 1000, // 1 GB
				},
				prices: [
					{
						type: "recurring",
						productId: process.env[
							"PRICE_ID_PRO_MONTHLY"
						] as string,
						interval: "month",
						amount: 29,
						currency: "USD",
						seatBased: true,
						trialPeriodDays: 7,
					},
					{
						type: "recurring",
						productId: process.env["PRICE_ID_PRO_YEARLY"] as string,
						interval: "year",
						amount: 290,
						currency: "USD",
						seatBased: true,
						trialPeriodDays: 7,
					},
				],
			},
			lifetime: {
				limits: {
					members: -1, // unlimited
					projects: -1,
					apiCalls: -1,
					storage: 10000, // 10 GB
				},
				prices: [
					{
						type: "one-time",
						productId: process.env["PRICE_ID_LIFETIME"] as string,
						amount: 799,
						currency: "USD",
					},
				],
			},
			enterprise: {
				isEnterprise: true,
				limits: {
					members: -1, // unlimited
					projects: -1,
					apiCalls: -1,
					storage: -1,
				},
			},
		},
	},
} as const satisfies Config;

export type {
	Config,
	IntegrationsConfig,
	JobsConfig,
	PlanLimits,
	QuotaType,
	SecurityConfig,
} from "./types";
