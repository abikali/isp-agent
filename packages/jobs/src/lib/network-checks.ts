import dns from "node:dns/promises";
import net from "node:net";

const HOSTNAME_RE =
	/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

export function validateHost(host: string): string | null {
	if (!host || host.length === 0) {
		return "Host cannot be empty";
	}
	if (host.length > 253) {
		return "Host exceeds maximum length of 253 characters";
	}
	if (IPV4_RE.test(host)) {
		const octets = host.split(".").map(Number);
		for (const octet of octets) {
			if (octet < 0 || octet > 255) {
				return `Invalid IPv4 octet: ${octet}`;
			}
		}
		return null;
	}
	if (!HOSTNAME_RE.test(host)) {
		return "Invalid hostname";
	}
	return null;
}

export interface CheckResult {
	success: boolean;
	latencyMs?: number | undefined;
	message: string;
}

export function tcpPing(
	host: string,
	port: number,
	timeout: number,
): Promise<number> {
	return new Promise((resolve, reject) => {
		const start = performance.now();
		const socket = net.connect({ host, port, timeout }, () => {
			const rtt = performance.now() - start;
			socket.destroy();
			resolve(rtt);
		});
		socket.setTimeout(timeout);
		socket.on("timeout", () => {
			socket.destroy();
			reject(new Error("Timeout"));
		});
		socket.on("error", (err) => {
			socket.destroy();
			reject(err);
		});
	});
}

export async function checkPort(
	host: string,
	port: number,
	timeout: number,
): Promise<CheckResult> {
	return new Promise((resolve) => {
		const start = performance.now();
		const socket = net.connect({ host, port, timeout }, () => {
			const latency = performance.now() - start;
			socket.destroy();
			resolve({
				success: true,
				latencyMs: Math.round(latency),
				message: `Port ${port} is open`,
			});
		});
		socket.setTimeout(timeout);
		socket.on("timeout", () => {
			socket.destroy();
			resolve({
				success: false,
				message: `Port ${port} timed out after ${timeout}ms`,
			});
		});
		socket.on("error", (err) => {
			socket.destroy();
			resolve({
				success: false,
				message: `Port ${port}: ${err.message}`,
			});
		});
	});
}

export async function dnsResolve(
	domain: string,
	recordType: string,
	timeout: number,
): Promise<CheckResult> {
	try {
		const start = performance.now();
		const result = await Promise.race([
			resolveRecord(domain, recordType),
			new Promise<never>((_, reject) =>
				setTimeout(
					() => reject(new Error("DNS lookup timed out")),
					timeout,
				),
			),
		]);
		const latency = performance.now() - start;
		const records = Array.isArray(result) ? result : [result];
		if (records.length === 0) {
			return {
				success: false,
				message: `No ${recordType} records found for ${domain}`,
			};
		}
		return {
			success: true,
			latencyMs: Math.round(latency),
			message: `Resolved ${records.length} ${recordType} record(s) for ${domain}`,
		};
	} catch (error) {
		return {
			success: false,
			message: `DNS lookup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

function resolveRecord(domain: string, recordType: string): Promise<unknown> {
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
		default:
			return dns.resolve(domain, recordType);
	}
}

export async function httpCheck(
	url: string,
	options: {
		method?: string | undefined;
		expectedStatus?: number | undefined;
		timeout?: number | undefined;
		headers?: Record<string, string> | undefined;
	},
): Promise<CheckResult> {
	const method = options.method ?? "GET";
	const timeout = options.timeout ?? 10000;
	const expectedStatus = options.expectedStatus ?? 200;

	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeout);
		const start = performance.now();

		const fetchInit: RequestInit = {
			method,
			signal: controller.signal,
			redirect: "follow",
		};
		if (options.headers) {
			fetchInit.headers = options.headers;
		}

		const response = await fetch(url, fetchInit);

		clearTimeout(timer);
		const latency = performance.now() - start;

		if (response.status === expectedStatus) {
			return {
				success: true,
				latencyMs: Math.round(latency),
				message: `HTTP ${response.status} (${Math.round(latency)}ms)`,
			};
		}

		return {
			success: false,
			latencyMs: Math.round(latency),
			message: `Expected ${expectedStatus}, got ${response.status}`,
		};
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			return {
				success: false,
				message: `HTTP request timed out after ${timeout}ms`,
			};
		}
		return {
			success: false,
			message: `HTTP request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}
