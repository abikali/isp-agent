import type { IntegrationProvider } from "./types";

/**
 * All supported integration providers for frontend display.
 */
export const INTEGRATION_PROVIDERS: IntegrationProvider[] = [
	// CRM Integrations
	{
		key: "hubspot",
		name: "HubSpot",
		description: "Sync contacts to HubSpot CRM",
		category: "crm",
		supportsContactSync: true,
	},
	{
		key: "salesforce",
		name: "Salesforce",
		description: "Push leads and contacts to Salesforce",
		category: "crm",
		supportsContactSync: true,
		comingSoon: true,
	},
	{
		key: "zoho-crm",
		name: "Zoho CRM",
		description: "Sync contacts with Zoho CRM",
		category: "crm",
		supportsContactSync: true,
		comingSoon: true,
	},
	{
		key: "pipedrive",
		name: "Pipedrive",
		description: "Push contacts as persons to Pipedrive",
		category: "crm",
		supportsContactSync: true,
		comingSoon: true,
	},
	{
		key: "freshsales",
		name: "Freshsales",
		description: "Sync contacts to Freshsales",
		category: "crm",
		supportsContactSync: true,
		comingSoon: true,
	},
	// Communication
	{
		key: "slack",
		name: "Slack",
		description: "Get notifications for new leads in Slack",
		category: "communication",
		supportsContactSync: false,
		comingSoon: true,
	},
	// Automation
	{
		key: "zapier",
		name: "Zapier",
		description: "Connect to 5000+ apps via Zapier",
		category: "automation",
		supportsContactSync: true,
		comingSoon: true,
	},
	// Productivity
	{
		key: "google-sheets",
		name: "Google Sheets",
		description: "Export contacts to Google Sheets",
		category: "productivity",
		supportsContactSync: true,
		comingSoon: true,
	},
];

/**
 * Get provider by key.
 */
export function getProvider(key: string): IntegrationProvider | undefined {
	return INTEGRATION_PROVIDERS.find((p) => p.key === key);
}

/**
 * Get providers by category.
 */
export function getProvidersByCategory(
	category: IntegrationProvider["category"],
): IntegrationProvider[] {
	return INTEGRATION_PROVIDERS.filter((p) => p.category === category);
}

/**
 * Provider categories for UI grouping.
 */
export const PROVIDER_CATEGORIES = {
	crm: {
		label: "CRM",
		description: "Customer Relationship Management",
	},
	communication: {
		label: "Communication",
		description: "Messaging and notifications",
	},
	automation: {
		label: "Automation",
		description: "Workflow automation tools",
	},
	productivity: {
		label: "Productivity",
		description: "Productivity and collaboration",
	},
} as const;

/**
 * Get icon component for a provider.
 * Returns a simple text-based icon since we don't have actual provider logos.
 */
export function getProviderIconClass(key: string): string {
	const iconMap: Record<string, string> = {
		hubspot: "bg-orange-500",
		salesforce: "bg-blue-500",
		"zoho-crm": "bg-red-500",
		pipedrive: "bg-green-500",
		freshsales: "bg-purple-500",
		slack: "bg-pink-600",
		zapier: "bg-amber-500",
		"google-sheets": "bg-emerald-500",
	};
	return iconMap[key] || "bg-gray-500";
}

/**
 * Auto-sync events that can trigger automatic contact syncing.
 */
export const AUTO_SYNC_EVENTS = [
	{
		key: "contact.created" as const,
		label: "New contact captured",
		description: "Sync when a new lead or contact is captured",
	},
	{
		key: "contact.updated" as const,
		label: "Contact updated",
		description: "Sync when contact details are updated",
	},
] as const;

export type AutoSyncEventKey = (typeof AUTO_SYNC_EVENTS)[number]["key"];
