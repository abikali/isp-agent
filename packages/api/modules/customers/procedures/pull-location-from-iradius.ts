import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { queryIRadius, withIRadiusConnection } from "@repo/database/iradius";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Copy a customer's GPS pin from iRadius (`UserNas.GSMLat/GSMLng`) into the
 * local record.
 *
 * Coordinates are LOCAL_AUTHORITATIVE: the sync seeds them once at create
 * and then ignores iRadius, so a customer created before that seeding
 * existed never gets a pin even though iRadius has one (801 of the main
 * org's 3,142 linked customers as of 2026-09-10). Read-only on iRadius;
 * writes local only.
 */
export const pullCustomerLocationFromIRadius = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/pull-location-from-iradius",
		tags: ["Customers"],
		summary: "Copy the customer's GPS pin from iRadius into the app",
	})
	.input(z.object({ organizationId: z.string(), customerId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId, iradiusDisabled } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"update",
		);
		if (iradiusDisabled) {
			throw new ORPCError("BAD_REQUEST", {
				message: "iRadius is disabled for this organization.",
			});
		}
		const customer = await db.customer.findFirst({
			where: {
				id: input.customerId,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
			select: { id: true, externalId: true },
		});
		if (!customer) {
			throw new ORPCError("NOT_FOUND", { message: "Customer not found" });
		}
		if (!customer.externalId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Customer is not linked to iRadius",
			});
		}
		const externalId = Number.parseInt(customer.externalId, 10);

		const rows = await withIRadiusConnection((conn) =>
			queryIRadius(
				conn,
				"SELECT GSMLat, GSMLng FROM UserNas WHERE UserId = ? LIMIT 1",
				[externalId],
			),
		);
		const lat = Number(rows[0]?.["GSMLat"]);
		const lng = Number(rows[0]?.["GSMLng"]);
		if (
			!Number.isFinite(lat) ||
			!Number.isFinite(lng) ||
			(lat === 0 && lng === 0)
		) {
			throw new ORPCError("NOT_FOUND", {
				message: "iRadius has no location for this customer.",
			});
		}

		await db.customer.update({
			where: { id: customer.id },
			data: { latitude: lat, longitude: lng },
		});
		return { latitude: lat, longitude: lng };
	});
