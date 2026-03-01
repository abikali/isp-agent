import { scrypt } from "node:crypto";

export function hashPin(pin: string, salt: string): Promise<string> {
	return new Promise((resolve, reject) => {
		scrypt(pin, salt, 64, (err, derivedKey) => {
			if (err) {
				reject(err);
			} else {
				resolve(`${salt}:${derivedKey.toString("hex")}`);
			}
		});
	});
}
