import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { queueMarketingSend } from "@repo/jobs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	type AudienceInput,
	audienceSchema,
	type MaterializedRecipient,
	materializeAudience,
} from "../lib/audience";
import { resolveSaltiCredentials } from "../lib/salti-client";

/**
 * Clone an existing broadcast as a fresh `pending` broadcast and queue it.
 *
 * For ISP/CSV/manual audiences we re-materialize the recipient list right
 * now — operators expect "resend" to mean "send to whoever matches today",
 * not "send to the stale snapshot from last month". Set
 * `onlyFailedRecipients: true` to instead retry just the recipients that
 * failed in the source broadcast (no re-materialization).
 *
 * The original broadcast is left intact so the audit trail of the previous
 * run survives.
 */
export const resendBroadcast = protectedProcedure
	.route({
		method: "POST",
		path: "/marketing/broadcasts/{broadcastId}/resend",
		tags: ["Marketing"],
		summary: "Clone a broadcast and queue it as a new send",
	})
	.input(
		z.object({
			organizationId: z.string(),
			broadcastId: z.string(),
			name: z.string().min(1).max(120).optional(),
			onlyFailedRecipients: z.boolean().default(false),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"marketing",
			"send",
		);

		const source = await db.marketingBroadcast.findFirst({
			where: {
				id: input.broadcastId,
				organizationId: input.organizationId,
			},
		});
		if (!source) {
			throw new ORPCError("NOT_FOUND", {
				message: "Broadcast not found",
			});
		}

		const creds = await resolveSaltiCredentials(input.organizationId);
		if (!creds) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"Salti is not configured. Add an API token in Settings → Marketing.",
			});
		}

		const audience = source.audienceConfig as unknown as AudienceInput;
		// Best-effort validate the stored config so we surface a clear error
		// if the old broadcast used a schema we no longer accept.
		const parsed = audienceSchema.safeParse(audience);
		if (!parsed.success && !input.onlyFailedRecipients) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"Source broadcast uses an outdated audience config. Resend the failed recipients only, or rebuild it from scratch.",
			});
		}

		const cloneName =
			input.name?.trim() ??
			`${source.name} (resend ${new Date().toLocaleDateString()})`;

		let recipients: MaterializedRecipient[];
		if (input.onlyFailedRecipients) {
			const failed = await db.marketingBroadcastRecipient.findMany({
				where: { broadcastId: source.id, status: "failed" },
				select: {
					customerId: true,
					phone: true,
					contactName: true,
					variables: true,
				},
			});
			if (failed.length === 0) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"Source broadcast has no failed recipients to retry.",
				});
			}
			recipients = failed.map((r) => ({
				customerId: r.customerId,
				phone: r.phone,
				contactName: r.contactName,
				variables: (r.variables ?? {}) as Record<string, string>,
			}));
		} else if (audience.type === "salti_group") {
			recipients = [];
		} else {
			recipients = await materializeAudience({
				organizationId: input.organizationId,
				permCtx,
				activeDealerId,
				audience: parsed.success ? parsed.data : audience,
			});
			if (recipients.length === 0) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"No recipients match the saved audience right now. Adjust filters or pick a different list.",
				});
			}
		}

		const clone = await db.marketingBroadcast.create({
			data: {
				organizationId: input.organizationId,
				createdById: user.id,
				name: cloneName,
				templateName: source.templateName,
				templateLang: source.templateLang,
				variables: source.variables as never,
				audienceType: input.onlyFailedRecipients
					? "manual"
					: source.audienceType,
				audienceConfig: source.audienceConfig as never,
				totalRecipients: recipients.length,
				status: "pending",
			},
			select: {
				id: true,
				status: true,
				totalRecipients: true,
			},
		});

		const RECIPIENT_CHUNK_SIZE = 500;
		for (let i = 0; i < recipients.length; i += RECIPIENT_CHUNK_SIZE) {
			const chunk = recipients.slice(i, i + RECIPIENT_CHUNK_SIZE);
			await db.marketingBroadcastRecipient.createMany({
				data: chunk.map((r) => ({
					broadcastId: clone.id,
					customerId: r.customerId,
					phone: r.phone,
					contactName: r.contactName,
					variables: r.variables as never,
				})),
			});
		}

		await queueMarketingSend({ broadcastId: clone.id });

		return { broadcast: clone };
	});
