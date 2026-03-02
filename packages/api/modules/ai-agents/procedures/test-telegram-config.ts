import { ORPCError } from "@orpc/server";
import { testTelegramConfig as runTest } from "@repo/ai";
import { checkOrganizationAdmin } from "@repo/api/lib/membership";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const testTelegramConfig = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/tools/test-telegram",
		tags: ["AI Agents"],
		summary: "Validate a Telegram bot token and test sending to chat IDs",
	})
	.input(
		z.object({
			organizationId: z.string(),
			botToken: z.string().min(1),
			chatIds: z.array(z.string().min(1)).min(1),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const member = await checkOrganizationAdmin(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message:
					"Only organization admins can test AI agent tool configuration",
			});
		}

		return runTest(input.botToken, input.chatIds);
	});
