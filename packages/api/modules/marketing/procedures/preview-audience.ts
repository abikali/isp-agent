import { requirePermission } from "@repo/api/lib/permission";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { audienceSchema, materializeAudience } from "../lib/audience";

const SAMPLE_SIZE = 10;

export const previewAudience = protectedProcedure
	.route({
		method: "POST",
		path: "/marketing/audience/preview",
		tags: ["Marketing"],
		summary: "Preview recipient count + sample for an audience",
	})
	.input(
		z.object({
			organizationId: z.string(),
			audience: audienceSchema,
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"marketing",
			"read",
		);

		const a = input.audience;

		if (a.type === "salti_group") {
			return {
				total: null,
				sample: [],
				audienceType: a.type,
				note: "Recipient count is resolved on send for Salti groups.",
				duplicateCount: 0,
				suppressedCount: 0,
			};
		}

		// Same resolution the send path uses (dedupe by phone + opt-outs), so
		// the previewed count is exactly the number of rows that get queued.
		// Loading the full customer set is a few thousand narrow rows, and the
		// wizard caches previews for 30s.
		const { recipients, duplicateCount, suppressedCount } =
			await materializeAudience({
				organizationId: input.organizationId,
				permCtx,
				activeDealerId,
				audience: a,
			});
		return {
			total: recipients.length,
			sample: recipients.slice(0, SAMPLE_SIZE).map((r) => ({
				phone: r.phone,
				contactName: r.contactName,
				customerId: r.customerId,
			})),
			audienceType: a.type,
			note: null,
			duplicateCount,
			suppressedCount,
		};
	});
