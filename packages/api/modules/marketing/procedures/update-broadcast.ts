import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { audienceSchema, materializeAudience } from "../lib/audience";
import { templateVariablesSchema } from "../lib/template-variables";

/**
 * Edit a broadcast in `pending` state. Once a broadcast has started
 * (running/completed/failed/cancelled) the recipient rows are partially
 * processed and rewriting them would leave the audit trail inconsistent —
 * the operator should clone via `resendBroadcast` instead.
 *
 * When the audience changes we discard the previous recipient list and
 * rematerialize. Name/template/variables-only edits leave recipients
 * untouched and don't re-run materialization.
 */
export const updateBroadcast = protectedProcedure
	.route({
		method: "PATCH",
		path: "/marketing/broadcasts/{broadcastId}",
		tags: ["Marketing"],
		summary: "Update a pending broadcast",
	})
	.input(
		z.object({
			organizationId: z.string(),
			broadcastId: z.string(),
			name: z.string().min(1).max(120).optional(),
			templateName: z.string().min(1).optional(),
			templateLang: z.string().min(2).optional(),
			variables: templateVariablesSchema.optional(),
			audience: audienceSchema.optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"marketing",
			"send",
		);

		const existing = await db.marketingBroadcast.findFirst({
			where: {
				id: input.broadcastId,
				organizationId: input.organizationId,
			},
			select: { id: true, status: true },
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Broadcast not found",
			});
		}
		if (existing.status !== "pending") {
			throw new ORPCError("BAD_REQUEST", {
				message: `Cannot edit a ${existing.status} broadcast. Use Resend to clone it as a new broadcast.`,
			});
		}

		const data: Record<string, unknown> = {};
		if (input.name !== undefined) {
			data["name"] = input.name;
		}
		if (input.templateName !== undefined) {
			data["templateName"] = input.templateName;
		}
		if (input.templateLang !== undefined) {
			data["templateLang"] = input.templateLang;
		}
		if (input.variables !== undefined) {
			data["variables"] = input.variables as never;
		}

		// Audience change → rebuild recipient list.
		if (input.audience !== undefined) {
			const recipients =
				input.audience.type === "salti_group"
					? []
					: await materializeAudience({
							organizationId: input.organizationId,
							permCtx,
							activeDealerId,
							audience: input.audience,
						});
			if (
				input.audience.type !== "salti_group" &&
				recipients.length === 0
			) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"No recipients matched the new audience. Adjust filters or pick a different list.",
				});
			}
			await db.marketingBroadcastRecipient.deleteMany({
				where: { broadcastId: existing.id },
			});
			const RECIPIENT_CHUNK_SIZE = 500;
			for (let i = 0; i < recipients.length; i += RECIPIENT_CHUNK_SIZE) {
				const chunk = recipients.slice(i, i + RECIPIENT_CHUNK_SIZE);
				await db.marketingBroadcastRecipient.createMany({
					data: chunk.map((r) => ({
						broadcastId: existing.id,
						customerId: r.customerId,
						phone: r.phone,
						contactName: r.contactName,
						variables: r.variables as never,
					})),
				});
			}
			data["audienceType"] = input.audience.type;
			data["audienceConfig"] = input.audience as never;
			data["totalRecipients"] = recipients.length;
			data["sentCount"] = 0;
			data["failedCount"] = 0;
		}

		const broadcast = await db.marketingBroadcast.update({
			where: { id: existing.id },
			data,
			select: {
				id: true,
				name: true,
				status: true,
				totalRecipients: true,
			},
		});

		return { broadcast };
	});
