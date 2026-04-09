import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { runCreateLocationRequest } from "@repo/jobs";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Collector-facing variant of `customers.createLocationRequest`.
 *
 * Gated on `billing:collect` (not `customers:update`) so collectors can ask
 * a customer to share their location from the payment flow. Dealer-scope is
 * enforced via `getDealerScopeFilter` on the customer lookup.
 */
export const createLocationRequest = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/location/create-request",
		tags: ["Billing"],
		summary:
			"Send a WhatsApp location-request link to a customer from the collector flow",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"collect",
		);

		const customer = await db.customer.findFirst({
			where: {
				id: input.customerId,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
			select: { id: true },
		});
		if (!customer) {
			throw new ORPCError("NOT_FOUND", { message: "Customer not found" });
		}

		const result = await runCreateLocationRequest({
			organizationId: input.organizationId,
			customerId: input.customerId,
			createdById: user.id,
		});
		if (!result.ok) {
			if (result.reason === "no_phone") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Customer has no phone number on file",
				});
			}
			throw new ORPCError("NOT_FOUND", { message: "Customer not found" });
		}
		if (!result.whatsappSent) {
			logger.warn("Billing location request: WhatsApp send failed", {
				customerId: input.customerId,
			});
		}
		return {
			success: true,
			token: result.token,
			expiresAt: result.expiresAt,
			whatsappSent: result.whatsappSent,
		};
	});
