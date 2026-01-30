export type RateLimitConfig = {
	enabled: boolean;
	store: "memory" | "redis";
	redis?: {
		url: string;
	};
	limits: {
		api: { window: number; max: number };
		auth: { window: number; max: number };
		upload: { window: number; max: number };
		webhook: { window: number; max: number };
	};
};

export type JobsConfig = {
	enabled: boolean;
	redis: {
		url: string;
	};
	workers: {
		email: { concurrency: number };
		webhook: { concurrency: number };
		scheduled: { concurrency: number };
	};
};

export type SecurityConfig = {
	failedLogin: {
		enabled: boolean;
		baseDelayMs: number;
		maxDelayMs: number;
		delayMultiplier: number;
	};
	accountLockout: {
		enabled: boolean;
		maxFailedAttempts: number;
		lockoutDurationMinutes: number;
		notifyOnLockout: boolean;
	};
	deviceTracking: {
		enabled: boolean;
		notifyNewDevice: boolean;
		maxKnownDevices: number;
	};
};

export type PlanLimits = {
	members: number; // -1 for unlimited
	projects: number;
	apiCalls: number;
	storage: number; // in MB
};

export type QuotaType = keyof PlanLimits;

export type IntegrationsConfig = {
	enabled: boolean;
	nango: {
		secretKey: string;
		publicKey: string;
		host: string; // Self-hosted Nango URL (empty string = use cloud)
	};
};

export type Config = {
	appName: string;
	rateLimit: RateLimitConfig;
	jobs: JobsConfig;
	security: SecurityConfig;
	integrations: IntegrationsConfig;
	i18n: {
		enabled: boolean;
		locales: { [locale: string]: { currency: string; label: string } };
		defaultLocale: string;
		defaultCurrency: string;
		localeCookieName: string;
	};
	organizations: {
		enable: boolean;
		enableBilling: boolean;
		enableUsersToCreateOrganizations: boolean;
		requireOrganization: boolean;
		hideOrganization: boolean;
		forbiddenOrganizationSlugs: string[];
	};
	users: {
		enableBilling: boolean;
		enableOnboarding: boolean;
	};
	auth: {
		enableSignup: boolean;
		enableMagicLink: boolean;
		enableSocialLogin: boolean;
		enablePasskeys: boolean;
		enablePasswordLogin: boolean;
		enableTwoFactor: boolean;
		redirectAfterSignIn: string;
		redirectAfterLogout: string;
		sessionCookieMaxAge: number;
	};
	mails: {
		from: string;
	};
	storage: {
		bucketNames: {
			avatars: string;
		};
	};
	ui: {
		enabledThemes: Array<"light" | "dark">;
		defaultTheme: Config["ui"]["enabledThemes"][number];
		saas: {
			enabled: boolean;
			useSidebarLayout: boolean;
		};
		marketing: {
			enabled: boolean;
		};
	};
	contactForm: {
		enabled: boolean;
		to: string;
		subject: string;
	};
	payments: {
		plans: {
			[id: string]: {
				hidden?: boolean;
				isFree?: boolean;
				isEnterprise?: boolean;
				recommended?: boolean;
				limits?: PlanLimits;
				prices?: Array<
					{
						productId: string;
						amount: number;
						currency: string;
						hidden?: boolean;
					} & (
						| {
								type: "recurring";
								interval: "month" | "year" | "week";
								intervalCount?: number;
								trialPeriodDays?: number;
								seatBased?: boolean;
						  }
						| {
								type: "one-time";
						  }
					)
				>;
			};
		};
	};
};
