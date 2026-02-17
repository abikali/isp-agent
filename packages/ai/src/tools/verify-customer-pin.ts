import { scrypt, timingSafeEqual } from "node:crypto";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { RegisteredTool, ToolContext } from "./types";

const MAX_PIN_ATTEMPTS = 3;
const LOCKOUT_MINUTES = 15;

function hashPin(pin: string, salt: string): Promise<string> {
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

function verifyPin(pin: string, storedHash: string): Promise<boolean> {
	return new Promise((resolve, reject) => {
		const [salt, hash] = storedHash.split(":");
		if (!salt || !hash) {
			resolve(false);
			return;
		}
		scrypt(pin, salt, 64, (err, derivedKey) => {
			if (err) {
				reject(err);
			} else {
				const hashBuffer = Buffer.from(hash, "hex");
				resolve(timingSafeEqual(derivedKey, hashBuffer));
			}
		});
	});
}

const verifyCustomerPinDef = toolDefinition({
	name: "verify-customer-pin",
	description:
		"Verify a customer's identity using their 6-digit PIN. Must call identify-customer first to get the customerId. After 3 failed attempts, the conversation is locked for 15 minutes.",
	inputSchema: z.object({
		customerId: z
			.string()
			.describe("The customer ID from identify-customer"),
		pin: z
			.string()
			.length(6)
			.describe("The 6-digit PIN provided by the customer"),
	}),
});

function createVerifyCustomerPinTool(context: ToolContext) {
	return verifyCustomerPinDef.server(async (args) => {
		try {
			const { db } = await import("@repo/database");

			const conversation = await db.aiConversation.findUnique({
				where: { id: context.conversationId },
				select: {
					pinAttempts: true,
					pinLockedUntil: true,
				},
			});

			if (!conversation) {
				return {
					success: false,
					message: "Conversation not found.",
				};
			}

			// Check lockout
			if (
				conversation.pinLockedUntil &&
				conversation.pinLockedUntil > new Date()
			) {
				return {
					success: false,
					locked: true,
					message:
						"Too many failed attempts. Please try again later.",
				};
			}

			// Check attempt limit
			if (conversation.pinAttempts >= MAX_PIN_ATTEMPTS) {
				const lockUntil = new Date(
					Date.now() + LOCKOUT_MINUTES * 60 * 1000,
				);
				await db.aiConversation.update({
					where: { id: context.conversationId },
					data: {
						pinLockedUntil: lockUntil,
						pinAttempts: 0,
					},
				});
				return {
					success: false,
					locked: true,
					message:
						"Too many failed attempts. Please try again in 15 minutes.",
				};
			}

			// Load customer's PIN hash (scoped to org)
			const customer = await db.customer.findFirst({
				where: {
					id: args.customerId,
					organization: {
						id: context.organizationId,
					},
				},
				select: {
					id: true,
					pinHash: true,
				},
			});

			if (!customer) {
				return {
					success: false,
					message: "Customer not found.",
				};
			}

			if (!customer.pinHash) {
				return {
					success: false,
					message:
						"This customer has not set up a PIN yet. Please contact your service provider to set up a PIN.",
				};
			}

			// Verify PIN
			const isValid = await verifyPin(args.pin, customer.pinHash);

			if (isValid) {
				await db.aiConversation.update({
					where: { id: context.conversationId },
					data: {
						verifiedCustomerId: customer.id,
						pinAttempts: 0,
						pinLockedUntil: null,
					},
				});

				return {
					success: true,
					message: "Customer identity verified successfully.",
				};
			}

			// Failed attempt
			const newAttempts = conversation.pinAttempts + 1;
			await db.aiConversation.update({
				where: { id: context.conversationId },
				data: { pinAttempts: newAttempts },
			});

			const remaining = MAX_PIN_ATTEMPTS - newAttempts;
			return {
				success: false,
				message: `Incorrect PIN. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
				attemptsRemaining: remaining,
			};
		} catch (error) {
			return {
				success: false,
				message: `Verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	});
}

export { hashPin };

export const verifyCustomerPin: RegisteredTool = {
	metadata: {
		id: "verify-customer-pin",
		name: "Verify Customer PIN",
		description:
			"Verify a customer's 6-digit PIN to unlock account-specific information and tools",
		category: "customer",
		requiresConfig: false,
	},
	factory: createVerifyCustomerPinTool,
};
