/**
 * Security utilities for URL and IP validation
 */

/**
 * Checks if a hostname is a private/internal IP address
 * Blocks: localhost, 127.x.x.x, 10.x.x.x, 172.16-31.x.x, 192.168.x.x, ::1, link-local
 */
export function isPrivateIP(hostname: string): boolean {
	// Normalize hostname
	const host = hostname.toLowerCase().trim();

	// Block localhost variants
	if (
		host === "localhost" ||
		host === "127.0.0.1" ||
		host === "::1" ||
		host === "[::1]" ||
		host.endsWith(".localhost")
	) {
		return true;
	}

	// Block loopback range (127.0.0.0/8)
	if (host.startsWith("127.")) {
		return true;
	}

	// Block private IPv4 ranges
	const ipv4Match = host.match(
		/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
	);
	if (ipv4Match) {
		const [, a, b] = ipv4Match.map(Number);

		// 10.0.0.0/8 - Private
		if (a === 10) {
			return true;
		}

		// 172.16.0.0/12 - Private (172.16.x.x - 172.31.x.x)
		if (a === 172 && b !== undefined && b >= 16 && b <= 31) {
			return true;
		}

		// 192.168.0.0/16 - Private
		if (a === 192 && b === 168) {
			return true;
		}

		// 169.254.0.0/16 - Link-local
		if (a === 169 && b === 254) {
			return true;
		}

		// 0.0.0.0 - Invalid/any
		if (a === 0) {
			return true;
		}
	}

	// Block IPv6 private/link-local (simplified check)
	if (host.startsWith("fe80:") || host.startsWith("[fe80:")) {
		return true;
	}
	if (host.startsWith("fc") || host.startsWith("[fc")) {
		return true;
	}
	if (host.startsWith("fd") || host.startsWith("[fd")) {
		return true;
	}

	return false;
}

/**
 * List of hostnames that should never receive webhooks
 * These are cloud provider metadata endpoints and internal services
 */
const BLOCKED_HOSTNAMES = [
	// AWS metadata
	"169.254.169.254",
	// Google Cloud metadata
	"metadata.google.internal",
	"metadata.goog",
	// Azure metadata
	"169.254.169.254",
	// Kubernetes internal
	"kubernetes.default",
	"kubernetes.default.svc",
];

/**
 * Validates a webhook URL is safe to call (not internal/private)
 * Returns an error message if invalid, null if valid
 */
export function validateWebhookUrl(url: string): string | null {
	let urlObj: URL;
	try {
		urlObj = new URL(url);
	} catch {
		return "Invalid URL format";
	}

	const hostname = urlObj.hostname.toLowerCase();

	// Must be HTTPS in production (allow HTTP for testing)
	// Note: Could make this stricter by requiring HTTPS always
	if (urlObj.protocol !== "https:" && urlObj.protocol !== "http:") {
		return "Webhook URL must use HTTPS or HTTP protocol";
	}

	// Block localhost and private IPs
	if (isPrivateIP(hostname)) {
		return "Webhook URL cannot point to localhost or private IP addresses";
	}

	// Block known internal/metadata endpoints
	if (BLOCKED_HOSTNAMES.includes(hostname)) {
		return "Webhook URL points to a blocked internal service";
	}

	// Block URLs with credentials
	if (urlObj.username || urlObj.password) {
		return "Webhook URL cannot contain credentials";
	}

	return null;
}
