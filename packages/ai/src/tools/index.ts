import type { ToolRecord } from "../types";
import { dnsLookup } from "./dns-lookup";
import { emailCheck } from "./email-check";
import { escalateTelegram } from "./escalate-telegram";
import { ispBandwidthStats } from "./isp-bandwidth-stats";
import { ispDiagnoseCustomer } from "./isp-diagnose-customer";
import { ispMikrotikUsers } from "./isp-mikrotik-users";
import { ispPingCustomer } from "./isp-ping-customer";
import { ispPingIp } from "./isp-ping-ip";
import { ispSearchCustomer } from "./isp-search-customer";
import {
	getIspApiConfig,
	lookupCustomerByContactPhone,
} from "./lib/isp-api-client";
import { pingHost } from "./ping-host";
import { portScan } from "./port-scan";
import { speedTest } from "./speed-test";
import { traceroute } from "./traceroute";
import type { RegisteredTool, ToolContext, ToolMetadata } from "./types";

const TOOL_REGISTRY: Record<string, RegisteredTool> = {
	"ping-host": pingHost,
	"port-scan": portScan,
	traceroute: traceroute,
	"dns-lookup": dnsLookup,
	"email-check": emailCheck,
	"speed-test": speedTest,
	"isp-search-customer": ispSearchCustomer,
	"isp-diagnose-customer": ispDiagnoseCustomer,
	"isp-bandwidth-stats": ispBandwidthStats,
	"isp-mikrotik-users": ispMikrotikUsers,
	"isp-ping-customer": ispPingCustomer,
	"isp-ping-ip": ispPingIp,
	"escalate-telegram": escalateTelegram,
};

/**
 * Picks any enabled ISP tool's config to seed the shared verified-customer
 * lookup. All ISP tools point at the same iRadius in practice, so the first
 * configured one wins; env-var fallback in `getIspApiConfig` handles the
 * "no tool config" case.
 */
function findIspToolConfig(
	enabledToolIds: string[],
	toolConfigs: Record<string, Record<string, unknown>> | undefined,
): Record<string, unknown> | undefined {
	if (!toolConfigs) {
		return undefined;
	}
	for (const id of enabledToolIds) {
		if (id.startsWith("isp-") && toolConfigs[id]) {
			return toolConfigs[id];
		}
	}
	return undefined;
}

/**
 * Build the memoized verified-customer lookup attached to ToolContext.
 * Exported for unit tests; production code obtains it via `resolveTools`.
 */
export function makeIspCustomerLookup(
	context: ToolContext,
	ispToolConfig: Record<string, unknown> | undefined,
): () => Promise<Record<string, unknown> | null> {
	let cached: Promise<Record<string, unknown> | null> | null = null;
	return () => {
		if (cached) {
			return cached;
		}
		if (!context.contactPhone) {
			cached = Promise.resolve(null);
			return cached;
		}
		const cfg = getIspApiConfig({ ...context, toolConfig: ispToolConfig });
		if (!cfg.ok) {
			cached = Promise.resolve(null);
			return cached;
		}
		cached = lookupCustomerByContactPhone(cfg.config, context.contactPhone);
		return cached;
	};
}

/**
 * Resolve enabled tool IDs into an AI SDK tool record.
 * @param toolConfigs - Map of toolId to per-tool config (from AiAgentToolConfig)
 */
export function resolveTools(
	enabledToolIds: string[],
	context: ToolContext,
	toolConfigs?: Record<string, Record<string, unknown>> | undefined,
): ToolRecord {
	const enriched: ToolContext = {
		...context,
		getVerifiedIspCustomer: makeIspCustomerLookup(
			context,
			findIspToolConfig(enabledToolIds, toolConfigs),
		),
	};

	const tools: ToolRecord = {};
	for (const toolId of enabledToolIds) {
		const registered = TOOL_REGISTRY[toolId];
		if (registered) {
			const perToolContext: ToolContext = {
				...enriched,
				toolConfig: toolConfigs?.[toolId],
			};
			tools[toolId] = registered.factory(perToolContext);
		}
	}

	return tools;
}

/**
 * Get metadata for all available tools (for UI listing).
 * Includes defaultPromptSection so the UI can show defaults.
 */
export function getAvailableTools(): Array<
	ToolMetadata & { defaultPromptSection?: string | undefined }
> {
	return Object.values(TOOL_REGISTRY).map((t) => ({
		...t.metadata,
		defaultPromptSection: t.defaultPromptSection,
	}));
}

/**
 * Get the full tool registry for internal use (e.g. buildSystemPrompt).
 */
export function getToolRegistry(): Record<string, RegisteredTool> {
	return TOOL_REGISTRY;
}

/**
 * Check if a tool ID is valid.
 */
export function isValidToolId(toolId: string): boolean {
	return toolId in TOOL_REGISTRY;
}
