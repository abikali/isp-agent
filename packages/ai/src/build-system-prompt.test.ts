import { describe, expect, it } from "vitest";
import {
	buildSystemPrompt,
	extractToolPromptOverrides,
} from "./build-system-prompt";
import type { PromptSection } from "./default-prompt-sections";
import { DEFAULT_PROMPT_SECTIONS } from "./default-prompt-sections";

const BASE_PROMPT = "You are a helpful ISP support agent.";

describe("buildSystemPrompt", () => {
	// -----------------------------------------------------------------------
	// Base prompt
	// -----------------------------------------------------------------------

	it("starts with the base prompt", () => {
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: [],
		});
		expect(result.startsWith(BASE_PROMPT)).toBe(true);
	});

	it("always includes language matching section", () => {
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: [],
		});
		expect(result).toContain("## Language");
		expect(result).toContain("Arabizi");
	});

	it("language section is the last section", () => {
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: ["escalate-telegram"],
		});
		// Language section is the last major section — ends with the translate line
		expect(result).toMatch(
			/always translate when presenting to customer\.\s*$/,
		);
	});

	// -----------------------------------------------------------------------
	// Escalation section (tool-owned prompt)
	// -----------------------------------------------------------------------

	it("includes escalation section when escalate-telegram is enabled", () => {
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: ["escalate-telegram"],
		});
		expect(result).toContain("## Escalation via Telegram");
		expect(result).toContain("REAL Telegram message");
		expect(result).toContain("MUST call the tool");
		expect(result).toContain("Collect all relevant info");
	});

	it("does NOT include escalation section when escalate-telegram is not enabled", () => {
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: ["isp-search-customer"],
		});
		expect(result).not.toContain("ESCALATION:");
		expect(result).not.toContain("REAL Telegram message");
	});

	it("does NOT include escalation section when no tools are enabled", () => {
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: [],
		});
		expect(result).not.toContain("ESCALATION:");
	});

	// -----------------------------------------------------------------------
	// Diagnostics / ISP tools section (tool-owned prompt)
	// -----------------------------------------------------------------------

	it("includes diagnostics section when isp-search-customer is enabled", () => {
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: ["isp-search-customer"],
		});
		expect(result).toContain("Diagnostics Reference");
		expect(result).toContain("Account Status Gate");
		expect(result).toContain("Connection Type Detection");
		expect(result).toContain("Field Reference");
		expect(result).toContain("## Customer Not Found");
		expect(result).toContain("## Multiple Account Matches");
	});

	it("does NOT include diagnostics when isp-search-customer is not enabled", () => {
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: ["escalate-telegram"],
		});
		expect(result).not.toContain("Diagnostics Reference");
		expect(result).not.toContain("## Customer Not Found");
	});

	// -----------------------------------------------------------------------
	// Both tools enabled
	// -----------------------------------------------------------------------

	it("includes both escalation and diagnostics when both tools enabled", () => {
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: ["isp-search-customer", "escalate-telegram"],
		});
		expect(result).toContain("## Escalation via Telegram");
		expect(result).toContain("Diagnostics Reference");
		expect(result).toContain("## Customer Not Found");
		expect(result).toContain("## Multiple Account Matches");
		expect(result).toContain("## Language");
	});

	// -----------------------------------------------------------------------
	// Verbose tool section (agent-level prompt section)
	// -----------------------------------------------------------------------

	it("includes verbose tool narration for non-web-chat channels", () => {
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: ["isp-search-customer"],
		});
		expect(result).toContain("## Tool Usage Rules");
		expect(result).toContain("Never stop after a single tool call");
	});

	it("excludes verbose tool narration for web chat", () => {
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: ["isp-search-customer"],
			isWebChat: true,
		});
		expect(result).not.toContain("## Tool Usage Rules");
	});

	it("excludes verbose tool section when no tools are enabled", () => {
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: [],
		});
		expect(result).not.toContain("## Tool Usage Rules");
	});

	// -----------------------------------------------------------------------
	// Maintenance mode
	// -----------------------------------------------------------------------

	it("includes maintenance section when active", () => {
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: [],
			maintenanceMode: true,
			maintenanceMessage: "Fiber outage in Dekwane area, ETA 2 hours",
		});
		expect(result).toContain("MAINTENANCE MODE ACTIVE");
		expect(result).toContain("Fiber outage in Dekwane area, ETA 2 hours");
	});

	it("does NOT include maintenance section when not active", () => {
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: [],
			maintenanceMode: false,
			maintenanceMessage: "Some old message",
		});
		expect(result).not.toContain("MAINTENANCE MODE");
	});

	it("does NOT include maintenance section when message is undefined", () => {
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: [],
			maintenanceMode: true,
			maintenanceMessage: undefined,
		});
		expect(result).not.toContain("MAINTENANCE MODE");
	});

	// -----------------------------------------------------------------------
	// Contact info
	// -----------------------------------------------------------------------

	it("includes contact info when name and phone provided", () => {
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: [],
			contactName: "Ahmad",
			contactPhone: "+961123456",
			provider: "whatsapp",
		});
		expect(result).toContain("CUSTOMER CONTACT INFO");
		expect(result).toContain("Ahmad");
		expect(result).toContain("+961123456");
		expect(result).toContain("whatsapp");
	});

	it("includes contact info with only name", () => {
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: [],
			contactName: "Ahmad",
		});
		expect(result).toContain("name: Ahmad");
		expect(result).not.toContain("phone:");
	});

	it("includes contact info with only phone", () => {
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: [],
			contactPhone: "+961123456",
		});
		expect(result).toContain("phone: +961123456");
		expect(result).not.toContain("name:");
	});

	it("does NOT include contact info when neither provided", () => {
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: [],
		});
		expect(result).not.toContain("CUSTOMER CONTACT INFO");
	});

	it("defaults provider to 'messaging' when not specified", () => {
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: [],
			contactName: "Test",
		});
		expect(result).toContain("messaging");
	});

	// -----------------------------------------------------------------------
	// Tool prompt overrides
	// -----------------------------------------------------------------------

	it("uses tool prompt override when provided", () => {
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: ["escalate-telegram"],
			toolPromptOverrides: {
				"escalate-telegram": "Custom escalation instructions here.",
			},
		});
		expect(result).toContain("Custom escalation instructions here.");
		expect(result).not.toContain("REAL Telegram message");
	});

	it("empty string override suppresses tool prompt section", () => {
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: ["escalate-telegram"],
			toolPromptOverrides: {
				"escalate-telegram": "",
			},
		});
		expect(result).not.toContain("## Escalation via Telegram");
		expect(result).not.toContain("REAL Telegram message");
	});

	it("null override suppresses tool prompt section", () => {
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: ["escalate-telegram"],
			toolPromptOverrides: {
				"escalate-telegram": null,
			},
		});
		expect(result).not.toContain("## Escalation via Telegram");
	});

	// -----------------------------------------------------------------------
	// Agent-level prompt sections (configurable)
	// -----------------------------------------------------------------------

	it("uses custom prompt sections when provided", () => {
		const customSections: PromptSection[] = [
			{
				id: "custom-section",
				label: "Custom Rules",
				content: "Always be polite and professional.",
				enabled: true,
				condition: "always",
			},
		];
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: [],
			promptSections: customSections,
		});
		expect(result).toContain("Always be polite and professional.");
		// Should NOT include defaults when custom sections are provided
		expect(result).not.toContain("## Language");
	});

	it("skips disabled prompt sections", () => {
		const customSections: PromptSection[] = [
			{
				id: "disabled-section",
				label: "Disabled",
				content: "This should not appear.",
				enabled: false,
				condition: "always",
			},
			{
				id: "enabled-section",
				label: "Enabled",
				content: "This should appear.",
				enabled: true,
				condition: "always",
			},
		];
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: [],
			promptSections: customSections,
		});
		expect(result).not.toContain("This should not appear.");
		expect(result).toContain("This should appear.");
	});

	it("evaluates has-tools condition correctly", () => {
		const sections: PromptSection[] = [
			{
				id: "tools-only",
				label: "Tools Only",
				content: "Tool-specific instructions.",
				enabled: true,
				condition: "has-tools",
			},
		];

		// With tools
		const withTools = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: ["ping-host"],
			promptSections: sections,
		});
		expect(withTools).toContain("Tool-specific instructions.");

		// Without tools
		const withoutTools = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: [],
			promptSections: sections,
		});
		expect(withoutTools).not.toContain("Tool-specific instructions.");
	});

	it("evaluates has-tools-non-webchat condition correctly", () => {
		const sections: PromptSection[] = [
			{
				id: "non-webchat",
				label: "Non-WebChat",
				content: "Verbose tool narration.",
				enabled: true,
				condition: "has-tools-non-webchat",
			},
		];

		// With tools, not web chat
		const messaging = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: ["ping-host"],
			promptSections: sections,
		});
		expect(messaging).toContain("Verbose tool narration.");

		// With tools, web chat
		const webChat = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: ["ping-host"],
			isWebChat: true,
			promptSections: sections,
		});
		expect(webChat).not.toContain("Verbose tool narration.");
	});

	it("falls back to DEFAULT_PROMPT_SECTIONS when promptSections is empty array", () => {
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: ["isp-search-customer"],
			promptSections: [],
		});
		// Should use defaults
		expect(result).toContain("## Tool Usage Rules");
		expect(result).toContain("## Language");
	});

	it("falls back to DEFAULT_PROMPT_SECTIONS when promptSections is undefined", () => {
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: ["isp-search-customer"],
			promptSections: undefined,
		});
		expect(result).toContain("## Tool Usage Rules");
		expect(result).toContain("## Language");
	});

	// -----------------------------------------------------------------------
	// Backward compatibility — no new params = same output
	// -----------------------------------------------------------------------

	it("backward compat: no new params produces same sections as before", () => {
		const result = buildSystemPrompt({
			basePrompt: BASE_PROMPT,
			enabledTools: ["isp-search-customer", "escalate-telegram"],
		});
		// All original sections present
		expect(result).toContain("## Tool Usage Rules");
		expect(result).toContain("Diagnostics Reference");
		expect(result).toContain("## Customer Not Found");
		expect(result).toContain("## Multiple Account Matches");
		expect(result).toContain("## Escalation via Telegram");
		expect(result).toContain("## Language");
	});

	// -----------------------------------------------------------------------
	// Full integration — realistic scenario
	// -----------------------------------------------------------------------

	it("produces correct prompt for full webhook scenario", () => {
		const result = buildSystemPrompt({
			basePrompt: "You are LibanBot, an ISP customer support agent.",
			enabledTools: [
				"isp-search-customer",
				"isp-ping-customer",
				"isp-bandwidth-stats",
				"isp-mikrotik-users",
				"escalate-telegram",
			],
			contactName: "Ahmad Khoury",
			contactPhone: "+96171234567",
			provider: "telegram",
			maintenanceMode: true,
			maintenanceMessage: "Fiber cut in Jounieh, ETA 4 hours",
		});

		// All sections should be present
		expect(result).toContain("LibanBot");
		expect(result).toContain("MAINTENANCE MODE ACTIVE");
		expect(result).toContain("Jounieh");
		expect(result).toContain("Ahmad Khoury");
		expect(result).toContain("+96171234567");
		expect(result).toContain("telegram");
		expect(result).toContain("## Tool Usage Rules"); // verbose
		expect(result).toContain("Diagnostics Reference");
		expect(result).toContain("## Customer Not Found");
		expect(result).toContain("## Multiple Account Matches");
		expect(result).toContain("## Escalation via Telegram");
		expect(result).toContain("## Language");

		// Section ordering: base → maintenance → contact → tools → language
		const maintenanceIdx = result.indexOf("MAINTENANCE MODE");
		const contactIdx = result.indexOf("CUSTOMER CONTACT INFO");
		const diagnosticsIdx = result.indexOf("Diagnostics Reference");
		const escalationIdx = result.indexOf("## Escalation via Telegram");
		const languageIdx = result.indexOf("## Language");

		expect(maintenanceIdx).toBeLessThan(contactIdx);
		expect(contactIdx).toBeLessThan(diagnosticsIdx);
		expect(diagnosticsIdx).toBeLessThan(escalationIdx);
		expect(escalationIdx).toBeLessThan(languageIdx);
	});

	it("produces correct prompt for web chat (no contact, no verbose)", () => {
		const result = buildSystemPrompt({
			basePrompt: "You are LibanBot.",
			enabledTools: ["isp-search-customer", "escalate-telegram"],
			isWebChat: true,
		});

		expect(result).not.toContain("CUSTOMER CONTACT INFO");
		expect(result).not.toContain("## Tool Usage Rules");
		expect(result).toContain("## Escalation via Telegram");
		expect(result).toContain("Diagnostics Reference");
		expect(result).toContain("## Language");
	});
});

describe("extractToolPromptOverrides", () => {
	it("extracts prompt overrides from tool configs", () => {
		const configs = [
			{ toolId: "escalate-telegram", promptSection: "Custom escalation" },
			{ toolId: "isp-search-customer", promptSection: null },
			{ toolId: "ping-host" },
		];
		const result = extractToolPromptOverrides(configs);
		expect(result).toEqual({
			"escalate-telegram": "Custom escalation",
		});
	});

	it("returns empty object for empty configs", () => {
		const result = extractToolPromptOverrides([]);
		expect(result).toEqual({});
	});

	it("returns empty object when no configs have promptSection", () => {
		const configs = [
			{ toolId: "ping-host" },
			{ toolId: "traceroute", promptSection: null },
		];
		const result = extractToolPromptOverrides(configs);
		expect(result).toEqual({});
	});
});

describe("DEFAULT_PROMPT_SECTIONS", () => {
	it("has verbose-tool-usage section with has-tools-non-webchat condition", () => {
		const section = DEFAULT_PROMPT_SECTIONS.find(
			(s) => s.id === "verbose-tool-usage",
		);
		expect(section).toBeDefined();
		expect(section?.condition).toBe("has-tools-non-webchat");
		expect(section?.enabled).toBe(true);
	});

	it("has language section with always condition", () => {
		const section = DEFAULT_PROMPT_SECTIONS.find(
			(s) => s.id === "language",
		);
		expect(section).toBeDefined();
		expect(section?.condition).toBe("always");
		expect(section?.enabled).toBe(true);
	});
});
