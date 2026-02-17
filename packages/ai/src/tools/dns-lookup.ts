import dns from "node:dns/promises";
import { tool } from "ai";
import { z } from "zod";
import { validateHost } from "./lib/validate-host";
import type { RegisteredTool } from "./types";

const RECORD_TYPES = ["A", "AAAA", "MX", "NS", "TXT", "CNAME", "SOA"] as const;

function createDnsLookupTool() {
	return tool({
		description:
			"Perform DNS lookups for a domain to resolve A, AAAA, MX, NS, TXT, CNAME, or SOA records. Useful for diagnosing DNS configuration issues, verifying email setup, or checking domain records.",
		inputSchema: z.object({
			domain: z.string().describe("Domain name to look up"),
			recordType: z
				.enum(RECORD_TYPES)
				.default("A")
				.describe("DNS record type to query (default: A)"),
		}),
		execute: async (args) => {
			const hostError = validateHost(args.domain);
			if (hostError) {
				return { success: false, message: hostError };
			}

			try {
				const records = await resolveWithTimeout(
					args.domain,
					args.recordType,
					10000,
				);

				if (
					!records ||
					(Array.isArray(records) && records.length === 0)
				) {
					return {
						success: false,
						message: `No ${args.recordType} records found for ${args.domain}`,
					};
				}

				const formatted = formatRecords(args.recordType, records);

				return {
					success: true,
					message: `DNS ${args.recordType} lookup for ${args.domain}: ${formatted}`,
					records,
				};
			} catch (error) {
				const code = (error as NodeJS.ErrnoException).code;
				if (code === "ENOTFOUND" || code === "ENODATA") {
					return {
						success: false,
						message: `No ${args.recordType} records found for ${args.domain}`,
					};
				}
				return {
					success: false,
					message: `DNS lookup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
				};
			}
		},
	});
}

function resolveWithTimeout(
	domain: string,
	recordType: string,
	timeout: number,
): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error("DNS lookup timed out"));
		}, timeout);

		const resolver = getResolver(domain, recordType);
		resolver
			.then((result) => {
				clearTimeout(timer);
				resolve(result);
			})
			.catch((err) => {
				clearTimeout(timer);
				reject(err);
			});
	});
}

function getResolver(domain: string, recordType: string): Promise<unknown> {
	switch (recordType) {
		case "A":
			return dns.resolve4(domain);
		case "AAAA":
			return dns.resolve6(domain);
		case "MX":
			return dns.resolveMx(domain);
		case "NS":
			return dns.resolveNs(domain);
		case "TXT":
			return dns.resolveTxt(domain);
		case "CNAME":
			return dns.resolveCname(domain);
		case "SOA":
			return dns.resolveSoa(domain).then((soa) => [soa]);
		default:
			return dns.resolve(domain, recordType);
	}
}

function formatRecords(recordType: string, records: unknown): string {
	if (!Array.isArray(records)) {
		return JSON.stringify(records);
	}

	switch (recordType) {
		case "MX":
			return (records as Array<{ priority: number; exchange: string }>)
				.map((r) => `${r.exchange} (priority ${r.priority})`)
				.join(", ");
		case "TXT":
			return (records as string[][]).map((r) => r.join("")).join("; ");
		case "SOA": {
			const soa = records[0] as {
				nsname: string;
				hostmaster: string;
				serial: number;
				refresh: number;
				retry: number;
				expire: number;
				minttl: number;
			};
			return `NS: ${soa.nsname}, hostmaster: ${soa.hostmaster}, serial: ${soa.serial}`;
		}
		default:
			return (records as string[]).join(", ");
	}
}

export const dnsLookup: RegisteredTool = {
	metadata: {
		id: "dns-lookup",
		name: "DNS Lookup",
		description:
			"Resolve DNS records (A, AAAA, MX, NS, TXT, CNAME, SOA) for a domain",
		category: "diagnostics",
		requiresConfig: false,
	},
	factory: createDnsLookupTool,
};
