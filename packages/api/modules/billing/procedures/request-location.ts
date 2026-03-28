import { ORPCError } from "@orpc/server";
import {
	requirePermission,
	resolveCollectorScope,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const requestLocation = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/location/request",
		tags: ["Billing"],
		summary: "Send customer location to collector via Telegram",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"collect",
		);

		// Look up the collector's employee record and telegram chat ID
		const { employeeId } = await resolveCollectorScope(permCtx);
		if (!employeeId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "No employee record linked to your account",
			});
		}

		const [employee, customer] = await Promise.all([
			db.employee.findFirst({
				where: { id: employeeId },
				select: { telegramChatId: true, name: true },
			}),
			db.customer.findFirst({
				where: {
					id: input.customerId,
					organizationId: input.organizationId,
				},
				select: {
					firstName: true,
					lastName: true,
					username: true,
					latitude: true,
					longitude: true,
				},
			}),
		]);

		if (!employee?.telegramChatId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Telegram not configured for your account",
			});
		}

		if (!customer) {
			throw new ORPCError("NOT_FOUND", {
				message: "Customer not found",
			});
		}

		if (!customer.latitude || !customer.longitude) {
			throw new ORPCError("BAD_REQUEST", {
				message: "No location available for this customer",
			});
		}

		const customerName =
			[customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
			customer.username ||
			"Unknown";
		const mapsLink = `https://www.google.com/maps?q=${customer.latitude},${customer.longitude}`;
		const message = `Location for ${customerName}: ${mapsLink}`;

		// Send via Telegram bot API
		const apiUrl = process.env["TELEGRAM_ISP_API_URL"];
		const apiKey = process.env["TELEGRAM_ISP_API_KEY"];

		if (!apiUrl || !apiKey) {
			// Fallback: return the maps link so the frontend can open it directly
			logger.warn(
				"[Request Location] Telegram API not configured, returning link only",
			);
			return { success: false, mapsLink };
		}

		try {
			const response = await fetch(`${apiUrl}/api/send-message`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": apiKey,
				},
				body: JSON.stringify({
					worker_username: employee.telegramChatId,
					message,
				}),
				signal: AbortSignal.timeout(10000),
			});

			if (response.ok) {
				logger.info("[Request Location] Sent via Telegram", {
					customerId: input.customerId,
					collectorId: employeeId,
				});
				return { success: true, mapsLink };
			}

			logger.warn("[Request Location] Telegram API error", {
				status: response.status,
			});
			return { success: false, mapsLink };
		} catch (error) {
			logger.warn("[Request Location] Failed to send", {
				error: error instanceof Error ? error.message : String(error),
			});
			return { success: false, mapsLink };
		}
	});
