import net from "node:net";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { validateHost } from "./lib/validate-host";
import type { RegisteredTool } from "./types";

const PORT_PRESETS: Record<string, number[]> = {
	web: [80, 443],
	email: [25, 143, 465, 587, 993],
	database: [3306, 5432, 6379, 27017],
	common: [21, 22, 80, 443, 3306, 5432, 8080],
};

const KNOWN_SERVICES: Record<number, string> = {
	21: "FTP",
	22: "SSH",
	25: "SMTP",
	53: "DNS",
	80: "HTTP",
	110: "POP3",
	143: "IMAP",
	443: "HTTPS",
	465: "SMTPS",
	587: "SMTP Submission",
	993: "IMAPS",
	995: "POP3S",
	3306: "MySQL",
	5432: "PostgreSQL",
	6379: "Redis",
	8080: "HTTP Alt",
	27017: "MongoDB",
};

const MAX_PORTS = 20;

const portScanDef = toolDefinition({
	name: "port-scan",
	description:
		"Check if specific ports are open on a host. Supports custom port lists or presets (web, email, database, common). Useful for diagnosing connectivity and firewall issues.",
	inputSchema: z
		.object({
			host: z.string().describe("Hostname or IPv4 address to scan"),
			ports: z
				.array(z.number().int().min(1).max(65535))
				.max(MAX_PORTS)
				.optional()
				.describe("List of ports to check (max 20)"),
			preset: z
				.enum(["web", "email", "database", "common"])
				.optional()
				.describe(
					"Port preset: web=[80,443], email=[25,143,465,587,993], database=[3306,5432,6379,27017], common=[21,22,80,443,3306,5432,8080]",
				),
		})
		.refine((data) => data.ports || data.preset, {
			message: "Either ports or preset must be provided",
		}),
});

function createPortScanTool() {
	return portScanDef.server(async (args) => {
		const hostError = validateHost(args.host);
		if (hostError) {
			return { success: false, message: hostError };
		}

		const portsToScan = args.ports ?? PORT_PRESETS[args.preset ?? ""] ?? [];

		if (portsToScan.length === 0) {
			return {
				success: false,
				message:
					"No ports specified. Provide a ports array or a preset.",
			};
		}

		if (portsToScan.length > MAX_PORTS) {
			return {
				success: false,
				message: `Too many ports. Maximum is ${MAX_PORTS} per scan.`,
			};
		}

		const results = await Promise.all(
			portsToScan.map((port) => checkPort(args.host, port, 3000)),
		);

		const openCount = results.filter((r) => r.status === "open").length;

		return {
			success: true,
			message: `Port scan of ${args.host}: ${openCount}/${results.length} ports open`,
			results,
		};
	});
}

async function checkPort(
	host: string,
	port: number,
	timeout: number,
): Promise<{
	port: number;
	status: "open" | "closed" | "filtered";
	service: string;
}> {
	const service = KNOWN_SERVICES[port] ?? "Unknown";
	return new Promise((resolve) => {
		const socket = net.connect({ host, port, timeout }, () => {
			socket.destroy();
			resolve({ port, status: "open", service });
		});
		socket.setTimeout(timeout);
		socket.on("timeout", () => {
			socket.destroy();
			resolve({ port, status: "filtered", service });
		});
		socket.on("error", (err) => {
			socket.destroy();
			const code = (err as NodeJS.ErrnoException).code;
			if (code === "ECONNREFUSED") {
				resolve({ port, status: "closed", service });
			} else {
				resolve({ port, status: "filtered", service });
			}
		});
	});
}

export const portScan: RegisteredTool = {
	metadata: {
		id: "port-scan",
		name: "Port Scan",
		description:
			"Check if specific ports are open on a host to diagnose connectivity issues",
		category: "diagnostics",
		requiresConfig: false,
	},
	factory: createPortScanTool,
};
