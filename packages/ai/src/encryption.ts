import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
	const key = process.env["AI_CHANNEL_ENCRYPTION_KEY"];
	if (!key) {
		throw new Error(
			"AI_CHANNEL_ENCRYPTION_KEY environment variable is required",
		);
	}
	return Buffer.from(key, "hex");
}

export function encryptToken(plaintext: string): string {
	const key = getEncryptionKey();
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, key, iv, {
		authTagLength: AUTH_TAG_LENGTH,
	});

	const encrypted = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const authTag = cipher.getAuthTag();

	// Format: iv:authTag:encrypted (all base64)
	return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptToken(encrypted: string): string {
	const key = getEncryptionKey();
	const [ivB64, authTagB64, dataB64] = encrypted.split(":");

	if (!ivB64 || !authTagB64 || !dataB64) {
		throw new Error("Invalid encrypted token format");
	}

	const iv = Buffer.from(ivB64, "base64");
	const authTag = Buffer.from(authTagB64, "base64");
	const data = Buffer.from(dataB64, "base64");

	const decipher = createDecipheriv(ALGORITHM, key, iv, {
		authTagLength: AUTH_TAG_LENGTH,
	});
	decipher.setAuthTag(authTag);

	return Buffer.concat([decipher.update(data), decipher.final()]).toString(
		"utf8",
	);
}
