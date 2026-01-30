import { createHmac, randomBytes } from "node:crypto";

/**
 * Generate a new webhook secret
 */
export function generateWebhookSecret(): string {
	return `whsec_${randomBytes(24).toString("base64url")}`;
}

/**
 * Create an HMAC signature for a webhook payload
 */
export function signWebhookPayload(payload: string, secret: string): string {
	const timestamp = Math.floor(Date.now() / 1000);
	const signedPayload = `${timestamp}.${payload}`;
	const signature = createHmac("sha256", secret)
		.update(signedPayload)
		.digest("hex");

	return `t=${timestamp},v1=${signature}`;
}

/**
 * Verify a webhook signature
 */
export function verifyWebhookSignature(
	payload: string,
	signature: string,
	secret: string,
	tolerance = 300, // 5 minutes
): boolean {
	const parts = signature.split(",");
	const timestampPart = parts.find((p) => p.startsWith("t="));
	const signaturePart = parts.find((p) => p.startsWith("v1="));

	if (!timestampPart || !signaturePart) {
		return false;
	}

	const timestamp = Number.parseInt(timestampPart.slice(2), 10);
	const expectedSignature = signaturePart.slice(3);

	// Check timestamp is within tolerance
	const now = Math.floor(Date.now() / 1000);
	if (Math.abs(now - timestamp) > tolerance) {
		return false;
	}

	// Verify signature
	const signedPayload = `${timestamp}.${payload}`;
	const computedSignature = createHmac("sha256", secret)
		.update(signedPayload)
		.digest("hex");

	// Constant-time comparison
	if (expectedSignature.length !== computedSignature.length) {
		return false;
	}

	let result = 0;
	for (let i = 0; i < expectedSignature.length; i++) {
		result |=
			expectedSignature.charCodeAt(i) ^ computedSignature.charCodeAt(i);
	}

	return result === 0;
}
