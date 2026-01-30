import { ORPCError } from "@orpc/client";
import { getOrganizationMembership, getPurchaseById } from "@repo/database";
import { logger } from "@repo/logs";
import { createCustomerPortalLink as createCustomerPortalLinkFn } from "@repo/payments";
import { z } from "zod";
import { localeMiddleware } from "../../../orpc/middleware/locale-middleware";
import { rateLimitedProtectedProcedure } from "../../../orpc/procedures";

export const createCustomerPortalLink = rateLimitedProtectedProcedure
	.use(localeMiddleware)
	.route({
		method: "POST",
		path: "/payments/create-customer-portal-link",
		tags: ["Payments"],
		summary: "Create customer portal link",
		description:
			"Creates a customer portal link for the customer or team. If a purchase is provided, the link will be created for the customer of the purchase.",
	})
	.input(
		z.object({
			purchaseId: z.string(),
			redirectUrl: z.string().optional(),
		}),
	)
	.handler(
		async ({ input: { purchaseId, redirectUrl }, context: { user } }) => {
			const purchase = await getPurchaseById(purchaseId);

			if (!purchase) {
				throw new ORPCError("FORBIDDEN");
			}

			if (purchase.organizationId) {
				const userOrganizationMembership =
					await getOrganizationMembership(
						purchase.organizationId,
						user.id,
					);
				if (userOrganizationMembership?.role !== "owner") {
					throw new ORPCError("FORBIDDEN");
				}
			}

			if (purchase.userId && purchase.userId !== user.id) {
				throw new ORPCError("FORBIDDEN");
			}

			try {
				const options: {
					customerId: string;
					subscriptionId?: string;
					redirectUrl?: string;
				} = {
					customerId: purchase.customerId,
				};
				if (purchase.subscriptionId) {
					options.subscriptionId = purchase.subscriptionId;
				}
				if (redirectUrl !== undefined) {
					options.redirectUrl = redirectUrl;
				}
				const customerPortalLink =
					await createCustomerPortalLinkFn(options);

				if (!customerPortalLink) {
					throw new ORPCError("INTERNAL_SERVER_ERROR");
				}

				return { customerPortalLink };
			} catch (e) {
				logger.error("Could not create customer portal link", e);
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}
		},
	);
