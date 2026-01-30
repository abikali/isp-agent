import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	generateWebhookSecret,
	signWebhookPayload,
	verifyWebhookSignature,
} from "../sign";

describe("generateWebhookSecret", () => {
	it("generates a secret with the whsec_ prefix", () => {
		const secret = generateWebhookSecret();
		expect(secret.startsWith("whsec_")).toBe(true);
	});

	it("generates unique secrets on each call", () => {
		const secret1 = generateWebhookSecret();
		const secret2 = generateWebhookSecret();
		expect(secret1).not.toEqual(secret2);
	});

	it("generates a secret of expected length", () => {
		const secret = generateWebhookSecret();
		// whsec_ (6 chars) + 32 bytes in base64url (43 chars) = approximately 38 chars
		// 24 bytes in base64url = 32 chars, so total = 6 + 32 = 38 chars
		expect(secret.length).toBeGreaterThan(30);
		expect(secret.length).toBeLessThan(50);
	});

	it("generates secrets containing only valid characters", () => {
		const secret = generateWebhookSecret();
		// base64url charset: A-Z, a-z, 0-9, -, _
		expect(/^whsec_[A-Za-z0-9_-]+$/.test(secret)).toBe(true);
	});
});

describe("signWebhookPayload", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns a signature in the correct format", () => {
		const payload = JSON.stringify({ event: "user.created", data: {} });
		const secret = "whsec_testsecret123";

		const signature = signWebhookPayload(payload, secret);

		expect(signature).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
	});

	it("includes the correct timestamp", () => {
		const payload = JSON.stringify({ event: "user.created" });
		const secret = "whsec_testsecret123";

		const signature = signWebhookPayload(payload, secret);
		const expectedTimestamp = Math.floor(
			new Date("2024-01-15T10:00:00Z").getTime() / 1000,
		);

		expect(signature).toContain(`t=${expectedTimestamp}`);
	});

	it("generates correct HMAC-SHA256 signature", () => {
		const payload = JSON.stringify({ event: "user.created" });
		const secret = "whsec_testsecret123";
		const timestamp = Math.floor(Date.now() / 1000);

		const signature = signWebhookPayload(payload, secret);

		// Manually compute expected signature
		const signedPayload = `${timestamp}.${payload}`;
		const expectedHmac = createHmac("sha256", secret)
			.update(signedPayload)
			.digest("hex");

		expect(signature).toContain(`v1=${expectedHmac}`);
	});

	it("produces different signatures for different payloads", () => {
		const secret = "whsec_testsecret123";
		const payload1 = JSON.stringify({ event: "user.created" });
		const payload2 = JSON.stringify({ event: "user.deleted" });

		const signature1 = signWebhookPayload(payload1, secret);
		const signature2 = signWebhookPayload(payload2, secret);

		// Extract v1 part only (timestamp would be the same due to frozen time)
		const v1Part1 = signature1.split(",")[1];
		const v1Part2 = signature2.split(",")[1];

		expect(v1Part1).not.toEqual(v1Part2);
	});

	it("produces different signatures for different secrets", () => {
		const payload = JSON.stringify({ event: "user.created" });
		const secret1 = "whsec_secret1";
		const secret2 = "whsec_secret2";

		const signature1 = signWebhookPayload(payload, secret1);
		const signature2 = signWebhookPayload(payload, secret2);

		const v1Part1 = signature1.split(",")[1];
		const v1Part2 = signature2.split(",")[1];

		expect(v1Part1).not.toEqual(v1Part2);
	});
});

describe("verifyWebhookSignature", () => {
	const secret = "whsec_testsecret123";
	const payload = JSON.stringify({
		event: "user.created",
		data: { id: "123" },
	});

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns true for a valid signature within tolerance", () => {
		const signature = signWebhookPayload(payload, secret);

		const result = verifyWebhookSignature(payload, signature, secret);

		expect(result).toBe(true);
	});

	it("returns false for an invalid signature", () => {
		const signature = signWebhookPayload(payload, secret);
		const tamperedSignature = signature.replace(
			/v1=[a-f0-9]+/,
			"v1=invalid",
		);

		const result = verifyWebhookSignature(
			payload,
			tamperedSignature,
			secret,
		);

		expect(result).toBe(false);
	});

	it("returns false when timestamp part is missing", () => {
		const result = verifyWebhookSignature(payload, "v1=abcd1234", secret);

		expect(result).toBe(false);
	});

	it("returns false when signature part is missing", () => {
		const result = verifyWebhookSignature(payload, "t=1234567890", secret);

		expect(result).toBe(false);
	});

	it("returns false when signature format is completely invalid", () => {
		const result = verifyWebhookSignature(payload, "invalid", secret);

		expect(result).toBe(false);
	});

	it("returns false for a modified payload", () => {
		const signature = signWebhookPayload(payload, secret);
		const modifiedPayload = JSON.stringify({ event: "user.deleted" });

		const result = verifyWebhookSignature(
			modifiedPayload,
			signature,
			secret,
		);

		expect(result).toBe(false);
	});

	it("returns false for a wrong secret", () => {
		const signature = signWebhookPayload(payload, secret);

		const result = verifyWebhookSignature(
			payload,
			signature,
			"whsec_wrongsecret",
		);

		expect(result).toBe(false);
	});

	it("returns false when timestamp is outside tolerance window (past)", () => {
		const signature = signWebhookPayload(payload, secret);

		// Move time forward 6 minutes (outside 5-minute tolerance)
		vi.setSystemTime(new Date("2024-01-15T10:06:00Z"));

		const result = verifyWebhookSignature(payload, signature, secret);

		expect(result).toBe(false);
	});

	it("returns false when timestamp is outside tolerance window (future)", () => {
		const signature = signWebhookPayload(payload, secret);

		// Move time backward 6 minutes (outside 5-minute tolerance)
		vi.setSystemTime(new Date("2024-01-15T09:54:00Z"));

		const result = verifyWebhookSignature(payload, signature, secret);

		expect(result).toBe(false);
	});

	it("returns true when timestamp is within custom tolerance", () => {
		const signature = signWebhookPayload(payload, secret);

		// Move time forward 6 minutes
		vi.setSystemTime(new Date("2024-01-15T10:06:00Z"));

		// Use 10-minute tolerance
		const result = verifyWebhookSignature(payload, signature, secret, 600);

		expect(result).toBe(true);
	});

	it("handles edge case at exact tolerance boundary", () => {
		const signature = signWebhookPayload(payload, secret);

		// Move time forward exactly 5 minutes (at the boundary)
		vi.setSystemTime(new Date("2024-01-15T10:05:00Z"));

		const result = verifyWebhookSignature(payload, signature, secret);

		expect(result).toBe(true);
	});

	it("prevents timing attacks with constant-time comparison", () => {
		// This test verifies the signature length check works correctly
		const signature = signWebhookPayload(payload, secret);

		// Create a signature with a different length
		const shortSignature = signature.replace(/v1=[a-f0-9]{64}/, "v1=short");

		const result = verifyWebhookSignature(payload, shortSignature, secret);

		expect(result).toBe(false);
	});

	it("handles empty payload", () => {
		const emptyPayload = "";
		const signature = signWebhookPayload(emptyPayload, secret);

		const result = verifyWebhookSignature(emptyPayload, signature, secret);

		expect(result).toBe(true);
	});

	it("handles special characters in payload", () => {
		const specialPayload = JSON.stringify({
			message: "Hello, 世界! 🎉",
			special: '<script>alert("xss")</script>',
		});
		const signature = signWebhookPayload(specialPayload, secret);

		const result = verifyWebhookSignature(
			specialPayload,
			signature,
			secret,
		);

		expect(result).toBe(true);
	});
});
