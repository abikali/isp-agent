import type { ServerTool } from "@tanstack/ai";
import { dnsLookup } from "./dns-lookup";
import { emailCheck } from "./email-check";
import { escalateTelegram } from "./escalate-telegram";
import { ispBandwidthStats } from "./isp-bandwidth-stats";
import { ispMikrotikUsers } from "./isp-mikrotik-users";
import { ispPingCustomer } from "./isp-ping-customer";
import { ispPingIp } from "./isp-ping-ip";
import { ispSearchCustomer } from "./isp-search-customer";
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
	"isp-bandwidth-stats": ispBandwidthStats,
	"isp-mikrotik-users": ispMikrotikUsers,
	"isp-ping-customer": ispPingCustomer,
	"isp-ping-ip": ispPingIp,
	"escalate-telegram": escalateTelegram,
};

/**
 * Resolve enabled tool IDs into TanStack AI ServerTool instances.
 * @param toolConfigs - Map of toolId to per-tool config (from AiAgentToolConfig)
 */
export function resolveTools(
	enabledToolIds: string[],
	context: ToolContext,
	toolConfigs?: Record<string, Record<string, unknown>> | undefined,
): ServerTool[] {
	const tools: ServerTool[] = [];

	for (const toolId of enabledToolIds) {
		const registered = TOOL_REGISTRY[toolId];
		if (registered) {
			const perToolContext: ToolContext = {
				...context,
				toolConfig: toolConfigs?.[toolId],
			};
			tools.push(registered.factory(perToolContext));
		}
	}

	return tools;
}

/**
 * Get metadata for all available tools (for UI listing).
 */
export function getAvailableTools(): ToolMetadata[] {
	return Object.values(TOOL_REGISTRY).map((t) => t.metadata);
}

/**
 * Check if a tool ID is valid.
 */
export function isValidToolId(toolId: string): boolean {
	return toolId in TOOL_REGISTRY;
}
