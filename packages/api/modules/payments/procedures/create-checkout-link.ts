import { ORPCError } from "@orpc/client";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { type Config, config } from "@repo/config";
import { getOrganizationById } from "@repo/database";
import { logger } from "@repo/logs";
import {
	createCheckoutLink as createCheckoutLinkFn,
	getCustomerIdFromEntity,
} from "@repo/payments";
import { z } from "zod";
import { localeMiddleware } from "../../../orpc/middleware/locale-middleware";
import { rateLimitedProtectedProcedure } from "../../../orpc/procedures";

export const createCheckoutLink = rateLimitedProtectedProcedure
	.use(localeMiddleware)
	.route({
		method: "POST",
		path: "/payments/create-checkout-link",
		tags: ["Payments"],
		summary: "Create checkout link",
		description:
			"Creates a checkout link for a one-time or subscription product",
	})
	.input(
		z.object({
			type: z.enum(["one-time", "subscription"]),
			productId: z.string(),
			redirectUrl: z.string().optional(),
			organizationId: z.string().optional(),
		}),
	)
	.handler(
		async ({
			input: { productId, redirectUrl, type, organizationId },
			context: { user },
		}) => {
			// Verify organization membership if organizationId is provided
			if (organizationId) {
				const membership = await verifyOrganizationMembership(
					organizationId,
					user.id,
				);

				if (!membership) {
					throw new ORPCError("FORBIDDEN");
				}
			}

			const customerId = await getCustomerIdFromEntity(
				organizationId
					? {
							organizationId,
						}
					: {
							userId: user.id,
						},
			);

			const plans = config.payments.plans as Config["payments"]["plans"];

			const plan = Object.entries(plans).find(([_planId, plan]) =>
				plan.prices?.find((price) => price.productId === productId),
			);
			const price = plan?.[1].prices?.find(
				(price) => price.productId === productId,
			);
			const trialPeriodDays =
				price && "trialPeriodDays" in price
					? price.trialPeriodDays
					: undefined;

			const organization = organizationId
				? await getOrganizationById(organizationId)
				: undefined;

			if (organization === null) {
				throw new ORPCError("NOT_FOUND");
			}

			const seats =
				organization && price && "seatBased" in price && price.seatBased
					? organization.members.length
					: undefined;

			try {
				type CheckoutOptions = {
					type: "one-time" | "subscription";
					productId: string;
					email: string;
					name: string;
					organizationId?: string;
					userId?: string;
					redirectUrl?: string;
					trialPeriodDays?: number;
					seats?: number;
					customerId?: string;
				};
				const checkoutOptions: CheckoutOptions = {
					type,
					productId,
					email: user.email,
					name: user.name ?? "",
				};
				if (organizationId) {
					checkoutOptions.organizationId = organizationId;
				} else {
					checkoutOptions.userId = user.id;
				}
				if (redirectUrl !== undefined) {
					checkoutOptions.redirectUrl = redirectUrl;
				}
				if (trialPeriodDays !== undefined) {
					checkoutOptions.trialPeriodDays = trialPeriodDays;
				}
				if (seats !== undefined) {
					checkoutOptions.seats = seats;
				}
				if (customerId) {
					checkoutOptions.customerId = customerId;
				}
				const checkoutLink =
					await createCheckoutLinkFn(checkoutOptions);

				if (!checkoutLink) {
					throw new ORPCError("INTERNAL_SERVER_ERROR");
				}

				return { checkoutLink };
			} catch (e) {
				logger.error(e);
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}
		},
	);
