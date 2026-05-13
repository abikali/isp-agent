import { requirePermission } from "@repo/api/lib/permission";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	audienceSchema,
	materializeCsvRecipients,
	materializeManualRecipients,
	previewIspCustomerRecipients,
} from "../lib/audience";

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
		const shape = (
			total: number | null,
			recipients: Array<{
				phone: string;
				contactName: string | null;
				customerId: string | null;
			}>,
			note: string | null,
		) => ({
			total,
			sample: recipients,
			audienceType: a.type,
			note,
		});

		if (a.type === "salti_group") {
			return shape(
				null,
				[],
				"Recipient count is resolved on send for Salti groups.",
			);
		}

		if (a.type === "isp_customers") {
			const { total, sample } = await previewIspCustomerRecipients({
				organizationId: input.organizationId,
				permCtx,
				activeDealerId,
				filters: a,
			});
			return shape(
				total,
				sample.map((r) => ({
					phone: r.phone,
					contactName: r.contactName,
					customerId: r.customerId,
				})),
				null,
			);
		}

		// CSV and manual audiences are bounded by zod max (10k/2k); cheap to
		// materialize in full for the count.
		const recipients =
			a.type === "csv"
				? materializeCsvRecipients(a.rows)
				: materializeManualRecipients(a.phones);
		return shape(
			recipients.length,
			recipients.slice(0, 10).map((r) => ({
				phone: r.phone,
				contactName: r.contactName,
				customerId: r.customerId,
			})),
			null,
		);
	});
