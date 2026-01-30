import {
	getLockedAccounts,
	getLoginHistory,
	getUserDevices,
	removeDevice,
	unlockAccount,
} from "@repo/security";
import { z } from "zod";
import {
	adminProcedure,
	protectedProcedure,
	publicProcedure,
} from "../../orpc/procedures";

/**
 * Get all currently locked accounts (admin only)
 */
const listLockedAccounts = adminProcedure
	.route({
		method: "GET",
		path: "/security/locked-accounts",
		tags: ["security"],
		summary: "List locked accounts",
	})
	.handler(async () => {
		const accounts = await getLockedAccounts();
		return { accounts };
	});

/**
 * Manually unlock an account (admin only)
 */
const adminUnlockAccount = adminProcedure
	.route({
		method: "POST",
		path: "/security/unlock-account",
		tags: ["security"],
		summary: "Unlock a locked account",
	})
	.input(
		z.object({
			userId: z.string(),
		}),
	)
	.handler(async ({ input, context }) => {
		await unlockAccount(input.userId, context.user.id);
		return { success: true };
	});

/**
 * Get user's known devices
 */
const listUserDevices = protectedProcedure
	.route({
		method: "GET",
		path: "/security/devices",
		tags: ["security"],
		summary: "List user's known devices",
	})
	.handler(async ({ context }) => {
		const devices = await getUserDevices(context.user.id);
		return { devices };
	});

/**
 * Remove a known device
 */
const deleteDevice = protectedProcedure
	.route({
		method: "DELETE",
		path: "/security/devices/{deviceId}",
		tags: ["security"],
		summary: "Remove a known device",
	})
	.input(
		z.object({
			deviceId: z.string(),
		}),
	)
	.handler(async ({ input, context }) => {
		await removeDevice(context.user.id, input.deviceId);
		return { success: true };
	});

/**
 * Get user's login history
 */
const listLoginHistory = protectedProcedure
	.route({
		method: "GET",
		path: "/security/login-history",
		tags: ["security"],
		summary: "Get login history",
	})
	.input(
		z
			.object({
				limit: z.number().min(1).max(100).optional().default(20),
			})
			.optional(),
	)
	.handler(async ({ input, context }) => {
		const history = await getLoginHistory(
			context.user.id,
			input?.limit ?? 20,
		);
		return { history };
	});

export const securityRouter = publicProcedure.router({
	listLockedAccounts,
	unlockAccount: adminUnlockAccount,
	listDevices: listUserDevices,
	deleteDevice,
	listLoginHistory,
});
