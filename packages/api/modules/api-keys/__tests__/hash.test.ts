import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateApiKey, hashApiKey, isValidApiKeyFormat } from "../lib/hash";

describe("generateApiKey", () => {
	it("returns an object with plainKey, keyHash, and keyPrefix", () => {
		const result = generateApiKey();

		expect(result).toHaveProperty("plainKey");
		expect(result).toHaveProperty("keyHash");
		expect(result).toHaveProperty("keyPrefix");
	});

	it("generates a plainKey with libancom_ prefix", () => {
		const { plainKey } = generateApiKey();

		expect(plainKey.startsWith("libancom_")).toBe(true);
	});

	it("generates a plainKey with expected format and length", () => {
		const { plainKey } = generateApiKey();

		// libancom_ (9 chars) + 32 bytes in base64url (43 chars) = 52 chars
		expect(plainKey.length).toBe(52);
		expect(isValidApiKeyFormat(plainKey)).toBe(true);
	});

	it("generates unique keys on each call", () => {
		const key1 = generateApiKey();
		const key2 = generateApiKey();

		expect(key1.plainKey).not.toEqual(key2.plainKey);
		expect(key1.keyHash).not.toEqual(key2.keyHash);
	});

	it("generates a correct SHA-256 hash", () => {
		const { plainKey, keyHash } = generateApiKey();

		const expectedHash = createHash("sha256")
			.update(plainKey)
			.digest("hex");

		expect(keyHash).toBe(expectedHash);
		expect(keyHash.length).toBe(64); // SHA-256 produces 64 hex chars
	});

	it("generates a keyPrefix with first 14 characters of plainKey", () => {
		const { plainKey, keyPrefix } = generateApiKey();

		expect(keyPrefix).toBe(plainKey.substring(0, 14));
		expect(keyPrefix.startsWith("libancom_")).toBe(true);
		expect(keyPrefix.length).toBe(14);
	});

	it("generates keys containing only valid base64url characters", () => {
		const { plainKey } = generateApiKey();

		// base64url charset: A-Z, a-z, 0-9, -, _
		expect(/^libancom_[A-Za-z0-9_-]+$/.test(plainKey)).toBe(true);
	});
});

describe("hashApiKey", () => {
	it("returns a SHA-256 hash of the input", () => {
		const plainKey = "libancom_testkey123abc";

		const hash = hashApiKey(plainKey);
		const expectedHash = createHash("sha256")
			.update(plainKey)
			.digest("hex");

		expect(hash).toBe(expectedHash);
	});

	it("returns a 64-character hex string", () => {
		const hash = hashApiKey("libancom_anykey");

		expect(hash.length).toBe(64);
		expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
	});

	it("produces consistent hashes for the same input", () => {
		const plainKey = "libancom_consistentkey";

		const hash1 = hashApiKey(plainKey);
		const hash2 = hashApiKey(plainKey);

		expect(hash1).toBe(hash2);
	});

	it("produces different hashes for different inputs", () => {
		const hash1 = hashApiKey("libancom_key1");
		const hash2 = hashApiKey("libancom_key2");

		expect(hash1).not.toBe(hash2);
	});

	it("can hash a generated key and match the keyHash", () => {
		const { plainKey, keyHash } = generateApiKey();

		const computedHash = hashApiKey(plainKey);

		expect(computedHash).toBe(keyHash);
	});

	it("is case-sensitive", () => {
		const hash1 = hashApiKey("libancom_ABC");
		const hash2 = hashApiKey("libancom_abc");

		expect(hash1).not.toBe(hash2);
	});
});

describe("isValidApiKeyFormat", () => {
	it("returns true for a valid API key format", () => {
		const { plainKey } = generateApiKey();

		expect(isValidApiKeyFormat(plainKey)).toBe(true);
	});

	it("returns true for a manually constructed valid key", () => {
		// 43 base64url chars after prefix (32 bytes = 43 base64url chars), total 49 chars
		const validKey = "libancom_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";

		expect(isValidApiKeyFormat(validKey)).toBe(true);
	});

	it("returns false for key without libancom_ prefix", () => {
		const invalidKey = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";

		expect(isValidApiKeyFormat(invalidKey)).toBe(false);
	});

	it("returns false for key with wrong prefix", () => {
		const invalidKey = "wrong_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkl";

		expect(isValidApiKeyFormat(invalidKey)).toBe(false);
	});

	it("returns false for key that is too short", () => {
		const shortKey = "libancom_short";

		expect(isValidApiKeyFormat(shortKey)).toBe(false);
	});

	it("returns false for key that is too long", () => {
		const longKey = "libancom_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmEXTRA";

		expect(isValidApiKeyFormat(longKey)).toBe(false);
	});

	it("returns false for key with invalid characters", () => {
		// Contains + which is not in base64url charset
		const invalidKey = "libancom_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh+jkl";

		expect(isValidApiKeyFormat(invalidKey)).toBe(false);
	});

	it("returns false for empty string", () => {
		expect(isValidApiKeyFormat("")).toBe(false);
	});

	it("returns false for null-like values", () => {
		expect(isValidApiKeyFormat("null")).toBe(false);
		expect(isValidApiKeyFormat("undefined")).toBe(false);
	});

	it("accepts underscore and hyphen in key body", () => {
		// Base64url can contain _ and - (total 43 chars after prefix, 49 total)
		const keyWithSpecialChars =
			"libancom_ABCDE_GHIJKLMNOPQRSTUVWXYZ-bcdefghijklmnopq";

		expect(isValidApiKeyFormat(keyWithSpecialChars)).toBe(true);
	});

	it("rejects key with spaces", () => {
		const keyWithSpaces = "libancom_ABCDEFGHIJKLMNOPQRSTUVWXYZ bcdefghijkl";

		expect(isValidApiKeyFormat(keyWithSpaces)).toBe(false);
	});

	it("rejects key with only prefix", () => {
		expect(isValidApiKeyFormat("libancom_")).toBe(false);
	});
});
