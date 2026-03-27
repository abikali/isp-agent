import { randomBytes, scrypt as scryptCb, scryptSync } from "node:crypto";

/** Scrypt parameters matching Better Auth's default format */
const SCRYPT_PARAMS = { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 };
const KEY_LENGTH = 64;

/**
 * Hash a password using Better Auth's scrypt format (synchronous).
 * Format: `<hex-salt>:<hex-derived-key>`
 */
export function hashPasswordSync(password: string): string {
	const salt = randomBytes(16).toString("hex");
	const key = scryptSync(
		password.normalize("NFKC"),
		salt,
		KEY_LENGTH,
		SCRYPT_PARAMS,
	);
	return `${salt}:${key.toString("hex")}`;
}

/**
 * Hash a password using Better Auth's scrypt format (async).
 * Format: `<hex-salt>:<hex-derived-key>`
 */
export function hashPassword(password: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const salt = randomBytes(16).toString("hex");
		scryptCb(
			password.normalize("NFKC"),
			salt,
			KEY_LENGTH,
			SCRYPT_PARAMS,
			(err, key) => {
				if (err) {
					reject(err);
				} else {
					resolve(`${salt}:${key.toString("hex")}`);
				}
			},
		);
	});
}
