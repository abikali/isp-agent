import { ORPCError } from "@orpc/server";
import { telegram } from "@repo/ai";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Send a test Telegram message to an employee's configured chat id so an admin
 * can confirm the connection works. Returns a typed `reason` on failure so the
 * UI can explain exactly what's wrong (no chat id, bot misconfigured, or the
 * worker never tapped Start).
 */
export const testTelegram = protectedProcedure
	.route({
		method: "POST",
		path: "/employees/test-telegram",
		tags: ["Employees"],
		summary: "Send a test Telegram message to an employee",
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
			select: { telegramChatId: true, name: true },
		});
		if (!employee) {
			throw new ORPCError("NOT_FOUND", { message: "Employee not found" });
		}

		if (!employee.telegramChatId) {
			return { success: false as const, reason: "no_chat_id" as const };
		}

		const botToken = process.env["TELEGRAM_COLLECTOR_BOT_TOKEN"];
		if (!botToken) {
			return { success: false as const, reason: "no_bot_token" as const };
		}

		const result = await telegram.sendTextMessage(
			botToken,
			employee.telegramChatId,
			`✅ Test message — your Telegram is connected, ${employee.name}.`,
		);

		return result.success
			? { success: true as const }
			: { success: false as const, reason: "send_failed" as const };
	});
