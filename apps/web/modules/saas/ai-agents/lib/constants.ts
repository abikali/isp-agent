export const AI_MODEL_OPTIONS = [
	{ id: "gpt-4.1-mini", label: "GPT-4.1 Mini", provider: "openai" },
	{ id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "openai" },
	{ id: "gpt-4o", label: "GPT-4o", provider: "openai" },
	{ id: "gpt-5.2", label: "GPT-5.2", provider: "openai" },
	{ id: "claude-sonnet", label: "Claude Sonnet", provider: "anthropic" },
] as const;

export const PROVIDER_OPTIONS = [
	{ id: "whatsapp", label: "WhatsApp" },
	{ id: "telegram", label: "Telegram" },
] as const;
