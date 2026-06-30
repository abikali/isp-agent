import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
	resolveCollectorScope,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { tgLink, tgMessage } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

const TELEGRAM_BOT_TOKEN = process.env["TELEGRAM_COLLECTOR_BOT_TOKEN"];

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
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"collect",
		);

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
					...getDealerScopeFilter(activeDealerId),
				},
				select: {
					firstName: true,
					lastName: true,
					username: true,
					latitude: true,
					longitude: true,
					address: true,
				},
			}),
		]);

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

		if (!employee?.telegramChatId) {
			logger.warn("[Request Location] No Telegram chat ID for employee");
			return { success: false, mapsLink };
		}

		const botToken = TELEGRAM_BOT_TOKEN;

		if (!botToken) {
			logger.warn(
				"[Request Location] TELEGRAM_COLLECTOR_BOT_TOKEN not configured",
			);
			return { success: false, mapsLink };
		}

		const chatId = employee.telegramChatId;

		try {
			// Send the location pin
			const locationRes = await fetch(
				`https://api.telegram.org/bot${botToken}/sendLocation`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						chat_id: chatId,
						latitude: customer.latitude,
						longitude: customer.longitude,
					}),
					signal: AbortSignal.timeout(10000),
				},
			);

			if (!locationRes.ok) {
				const body = await locationRes.text();
				logger.warn("[Request Location] Telegram sendLocation failed", {
					status: locationRes.status,
					body,
				});
				return { success: false, mapsLink };
			}

			// Follow up with customer name + username + address + maps link
			const text = tgMessage({
				icon: "📍",
				title: customerName,
				fields: [
					customer.username
						? {
								icon: "🆔",
								label: "Username",
								value: customer.username,
								copyable: true,
							}
						: null,
					customer.address
						? { icon: "🏠", value: customer.address }
						: null,
				],
				footer: tgLink("Open in Google Maps →", mapsLink),
			});

			await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					chat_id: chatId,
					text,
					parse_mode: "HTML",
					disable_web_page_preview: true,
				}),
				signal: AbortSignal.timeout(10000),
			});

			logger.info("[Request Location] Sent via Telegram", {
				customerId: input.customerId,
				collectorId: employeeId,
			});
			return { success: true, mapsLink };
		} catch (error) {
			logger.warn("[Request Location] Failed to send", {
				error: error instanceof Error ? error.message : String(error),
			});
			return { success: false, mapsLink };
		}
	});
