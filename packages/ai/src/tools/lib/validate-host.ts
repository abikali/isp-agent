const HOSTNAME_RE =
	/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

/**
 * Validate a hostname or IPv4 address.
 * Returns an error message string if invalid, or `null` if valid.
 */
export function validateHost(host: string): string | null {
	if (!host || host.length === 0) {
		return "Host cannot be empty";
	}

	if (host.length > 253) {
		return "Host exceeds maximum length of 253 characters";
	}

	// Check for IPv4
	if (IPV4_RE.test(host)) {
		const octets = host.split(".").map(Number);
		for (const octet of octets) {
			if (octet < 0 || octet > 255) {
				return `Invalid IPv4 octet: ${octet}`;
			}
		}
		return null;
	}

	// Check for valid hostname
	if (!HOSTNAME_RE.test(host)) {
		return "Invalid hostname. Only alphanumeric characters, hyphens, and dots are allowed";
	}

	return null;
}
