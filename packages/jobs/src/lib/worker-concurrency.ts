/**
 * Reads a BullMQ worker's concurrency from an environment variable,
 * falling back to the supplied default. Accepts any positive integer.
 * Used by WPBox-facing workers (WhatsApp receipt, location request) to
 * let ops tune throughput against the upstream template rate limit
 * without code changes.
 */
export function getWorkerConcurrency(
	envVar: string,
	defaultValue: number,
): number {
	const raw = process.env[envVar];
	if (!raw) {
		return defaultValue;
	}
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}
