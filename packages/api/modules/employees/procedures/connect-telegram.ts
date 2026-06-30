import { randomBytes } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { telegram } from "@repo/ai";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { getBaseUrl } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Start the "Connect Telegram" deep-link flow for an employee. Mints a
 * one-time link token, (idempotently) ensures the collector bot's webhook
 * points at us, and returns a `https://t.me/<bot>?start=<token>` link. When the
 * worker opens it and taps Start, the inbound webhook
 * (`collectorBotWebhookHandler`) resolves the token and stores their chat id.
 */
export const connectTelegram = protectedProcedure
	.route({
		method: "POST",
		path: "/employees/connect-telegram",
		tags: ["Employees"],
		summary: "Generate a Telegram connect deep-link for an employee",
	})
	.input(z.object({ organizationId: z.string(), id: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"employees",
			"update",
		);

		const employee = await db.employee.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
			select: { id: true },
		});
		if (!employee) {
			throw new ORPCError("NOT_FOUND", { message: "Employee not found" });
		}

		const botToken = process.env["TELEGRAM_COLLECTOR_BOT_TOKEN"];
		if (!botToken) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Telegram bot is not configured (missing bot token)",
			});
		}

		const botUsername = await telegram.getBotUsername(botToken);
		if (!botUsername) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Could not reach Telegram to resolve the bot username",
			});
		}

		// Ensure the bot delivers /start updates to us. Idempotent — Telegram
		// just overwrites the existing webhook with the same URL.
		const secret = process.env["TELEGRAM_COLLECTOR_WEBHOOK_SECRET"] ?? "";
		await telegram.setWebhook(
			botToken,
			`${getBaseUrl()}/api/webhooks/collector-bot`,
			secret,
		);

		const token = randomBytes(24).toString("hex");
		await db.employee.update({
			where: { id: employee.id },
			data: { telegramLinkToken: token },
		});

		return {
			deepLink: `https://t.me/${botUsername}?start=${token}`,
			botUsername,
		};
	});
