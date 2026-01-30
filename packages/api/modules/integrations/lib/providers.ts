/**
 * Integration provider configurations.
 * Each provider maps to a Nango integration key.
 */

export interface IntegrationProvider {
	/** Nango provider config key */
	key: string;
	/** Display name */
	name: string;
	/** Short description */
	description: string;
	/** Category for grouping */
	category: "crm" | "communication" | "automation" | "productivity";
	/** Icon identifier (for frontend) */
	icon: string;
	/** Whether this provider supports contact sync */
	supportsContactSync: boolean;
	/** Available auto-sync events */
	autoSyncEvents: string[];
}

/**
 * All supported integration providers.
 * Configure in Nango dashboard to enable each one.
 */
export const INTEGRATION_PROVIDERS: IntegrationProvider[] = [
	// CRM Integrations
	{
		key: "hubspot",
		name: "HubSpot",
		description: "Sync contacts to HubSpot CRM",
		category: "crm",
		icon: "hubspot",
		supportsContactSync: true,
		autoSyncEvents: ["contact.created", "contact.updated"],
	},
	{
		key: "salesforce",
		name: "Salesforce",
		description: "Push leads and contacts to Salesforce",
		category: "crm",
		icon: "salesforce",
		supportsContactSync: true,
		autoSyncEvents: ["contact.created", "contact.updated"],
	},
	{
		key: "zoho-crm",
		name: "Zoho CRM",
		description: "Sync contacts with Zoho CRM",
		category: "crm",
		icon: "zoho",
		supportsContactSync: true,
		autoSyncEvents: ["contact.created", "contact.updated"],
	},
	{
		key: "pipedrive",
		name: "Pipedrive",
		description: "Push contacts as persons to Pipedrive",
		category: "crm",
		icon: "pipedrive",
		supportsContactSync: true,
		autoSyncEvents: ["contact.created", "contact.updated"],
	},
	{
		key: "freshsales",
		name: "Freshsales",
		description: "Sync contacts to Freshsales",
		category: "crm",
		icon: "freshsales",
		supportsContactSync: true,
		autoSyncEvents: ["contact.created", "contact.updated"],
	},
	// Communication
	{
		key: "slack",
		name: "Slack",
		description: "Get notifications for new leads in Slack",
		category: "communication",
		icon: "slack",
		supportsContactSync: false,
		autoSyncEvents: ["contact.created"],
	},
	// Automation
	{
		key: "zapier",
		name: "Zapier",
		description: "Connect to 5000+ apps via Zapier",
		category: "automation",
		icon: "zapier",
		supportsContactSync: true,
		autoSyncEvents: ["contact.created", "contact.updated"],
	},
	// Productivity
	{
		key: "google-sheets",
		name: "Google Sheets",
		description: "Export contacts to Google Sheets",
		category: "productivity",
		icon: "google-sheets",
		supportsContactSync: true,
		autoSyncEvents: ["contact.created", "contact.updated"],
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
 * Contact field mapping for each provider.
 * Maps LibanCom contact fields to provider-specific field names.
 */
export const CONTACT_FIELD_MAPPINGS: Record<
	string,
	Record<string, string | ((contact: ContactData) => unknown)>
> = {
	hubspot: {
		firstname: (c) => c.name?.split(" ")[0] || "",
		lastname: (c) => c.name?.split(" ").slice(1).join(" ") || "",
		email: "email",
		phone: "phone",
		company: "company",
		jobtitle: "title",
	},
	salesforce: {
		FirstName: (c) => c.name?.split(" ")[0] || "",
		LastName: (c) => c.name?.split(" ").slice(1).join(" ") || "Unknown",
		Email: "email",
		Phone: "phone",
		Company: "company",
		Title: "title",
	},
	"zoho-crm": {
		First_Name: (c) => c.name?.split(" ")[0] || "",
		Last_Name: (c) => c.name?.split(" ").slice(1).join(" ") || "Unknown",
		Email: "email",
		Phone: "phone",
		Account_Name: "company",
		Title: "title",
	},
	pipedrive: {
		name: "name",
		email: (c) => [{ value: c.email, primary: true }],
		phone: (c) => (c.phone ? [{ value: c.phone, primary: true }] : []),
		org_name: "company",
	},
	freshsales: {
		first_name: (c) => c.name?.split(" ")[0] || "",
		last_name: (c) => c.name?.split(" ").slice(1).join(" ") || "",
		email: "email",
		mobile_number: "phone",
		job_title: "title",
	},
	"google-sheets": {
		// Google Sheets uses array format
		row: (c) => [c.name, c.email, c.phone, c.company, c.title, c.notes],
	},
};

/**
 * Contact data structure for mapping.
 */
export interface ContactData {
	name?: string | null;
	email?: string | null;
	phone?: string | null;
	company?: string | null;
	title?: string | null;
	notes?: string | null;
}

/**
 * Map a contact to provider-specific format.
 */
export function mapContactToProvider(
	providerKey: string,
	contact: ContactData,
): Record<string, unknown> {
	const mapping = CONTACT_FIELD_MAPPINGS[providerKey];
	if (!mapping) {
		// Default mapping if no specific mapping exists
		return {
			name: contact.name,
			email: contact.email,
			phone: contact.phone,
			company: contact.company,
			title: contact.title,
			notes: contact.notes,
		};
	}

	const result: Record<string, unknown> = {};
	for (const [targetField, sourceOrFn] of Object.entries(mapping)) {
		if (typeof sourceOrFn === "function") {
			result[targetField] = sourceOrFn(contact);
		} else {
			result[targetField] = contact[sourceOrFn as keyof ContactData];
		}
	}

	return result;
}
