/// <reference types="vite/client" />

interface ImportMetaEnv {
	// Sentry
	readonly VITE_SENTRY_DSN?: string;

	// Nango (Integrations - supports self-hosted)
	readonly VITE_NANGO_PUBLIC_KEY?: string;
	readonly VITE_NANGO_HOST?: string;

	// Built-in Vite env
	readonly MODE: string;
	readonly DEV: boolean;
	readonly PROD: boolean;
	readonly SSR: boolean;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
