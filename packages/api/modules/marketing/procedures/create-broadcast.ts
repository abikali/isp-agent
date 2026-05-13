import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { queueMarketingSend } from "@repo/jobs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { audienceSchema, materializeAudience } from "../lib/audience";
import { resolveSaltiCredentials } from "../lib/salti-client";
import { templateVariablesSchema } from "../lib/template-variables";

export const createBroadcast = protectedProcedure
	.route({
		method: "POST",
		path: "/marketing/broadcasts",
		tags: ["Marketing"],
		summary: "Create and queue a marketing broadcast",
	})
	.input(
		z.object({
			organizationId: z.string(),
			name: z.string().min(1).max(120),
			templateName: z.string().min(1),
			templateLang: z.string().min(2),
			variables: templateVariablesSchema,
			audience: audienceSchema,
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"marketing",
			"send",
		);

		const creds = await resolveSaltiCredentials(input.organizationId);
		if (!creds) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"Salti is not configured. Add an API token in Settings → Marketing or set SALTI_API_TOKEN in the environment.",
			});
		}

		const recipients =
			input.audience.type === "salti_group"
				? []
				: await materializeAudience({
						organizationId: input.organizationId,
						permCtx,
						activeDealerId,
						audience: input.audience,
					});

		if (input.audience.type !== "salti_group" && recipients.length === 0) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"No recipients matched the selected audience. Adjust filters or upload phones.",
			});
		}

		const broadcast = await db.marketingBroadcast.create({
			data: {
				organizationId: input.organizationId,
				createdById: user.id,
				name: input.name,
				templateName: input.templateName,
				templateLang: input.templateLang,
				variables: input.variables as never,
				audienceType: input.audience.type,
				audienceConfig: input.audience as never,
				totalRecipients: recipients.length,
				status: "pending",
			},
			select: {
				id: true,
				status: true,
				totalRecipients: true,
				audienceType: true,
			},
		});

		// Chunk the recipient inserts. Postgres' bound-parameter limit
		// (~65k) caps how many rows a single createMany can send; with
		// 5 columns per row, 500 rows ≈ 2.5k params keeps us well clear
		// and lets us run a 10k-row CSV in 20 small writes.
		const RECIPIENT_CHUNK_SIZE = 500;
		for (let i = 0; i < recipients.length; i += RECIPIENT_CHUNK_SIZE) {
			const chunk = recipients.slice(i, i + RECIPIENT_CHUNK_SIZE);
			await db.marketingBroadcastRecipient.createMany({
				data: chunk.map((r) => ({
					broadcastId: broadcast.id,
					customerId: r.customerId,
					phone: r.phone,
					contactName: r.contactName,
					variables: r.variables as never,
				})),
			});
		}

		await queueMarketingSend({ broadcastId: broadcast.id });

		return { broadcast };
	});
