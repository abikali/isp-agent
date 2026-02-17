import type { ToolSet } from "ai";
import { contactEnrichment } from "./contact-enrichment";
import { crmExport } from "./crm-export";
import { customerInfo } from "./customer-info";
import { dnsLookup } from "./dns-lookup";
import { emailCheck } from "./email-check";
import { identifyCustomer } from "./identify-customer";
import { leadCapture } from "./lead-capture";
import { meetingScheduler } from "./meeting-scheduler";
import { pingHost } from "./ping-host";
import { portScan } from "./port-scan";
import { profileShare } from "./profile-share";
import { speedTest } from "./speed-test";
import { traceroute } from "./traceroute";
import type { RegisteredTool, ToolContext, ToolMetadata } from "./types";
import { verifyCustomerPin } from "./verify-customer-pin";

const TOOL_REGISTRY: Record<string, RegisteredTool> = {
	"lead-capture": leadCapture,
	"profile-share": profileShare,
	"meeting-scheduler": meetingScheduler,
	"contact-enrichment": contactEnrichment,
	"crm-export": crmExport,
	"ping-host": pingHost,
	"port-scan": portScan,
	traceroute: traceroute,
	"dns-lookup": dnsLookup,
	"email-check": emailCheck,
	"speed-test": speedTest,
	"identify-customer": identifyCustomer,
	"verify-customer-pin": verifyCustomerPin,
	"customer-info": customerInfo,
};

/**
 * Resolve enabled tool IDs into AI SDK CoreTool instances.
 * @param toolConfigs - Map of toolId to per-tool config (from AiAgentToolConfig)
 */
export function resolveTools(
	enabledToolIds: string[],
	context: ToolContext,
	toolConfigs?: Record<string, Record<string, unknown>> | undefined,
): ToolSet {
	const tools: ToolSet = {};

	for (const toolId of enabledToolIds) {
		const registered = TOOL_REGISTRY[toolId];
		if (registered) {
			const perToolContext: ToolContext = {
				...context,
				toolConfig: toolConfigs?.[toolId],
			};
			tools[toolId] = registered.factory(perToolContext);
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
