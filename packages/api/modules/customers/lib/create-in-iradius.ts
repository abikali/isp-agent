import { ORPCError } from "@orpc/server";
import { buildIRadiusMobile, db } from "@repo/database";
import { iradiusCreateUser } from "./iradius-api";

/** Format a Date as the tz-naive UTC "YYYY-MM-DD HH:MM:SS" iRadius expects. */
function toMysqlDateTimeUTC(d: Date | null | undefined): string | null {
	if (!d) {
		return null;
	}
	return d.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Create a local customer as a real iRadius subscriber and return the new
 * iRadius User.Id. Loads the customer + its linked plan/dealer/collector/station
 * to resolve the iRadius foreign keys, then calls the `/create-user` endpoint.
 *
 * Remote-only: the caller stores the returned id as `Customer.externalId`
 * (ideally in the same transaction as whatever else it's doing). Throws if the
 * customer is already linked, has no username, or its plan isn't linked to an
 * iRadius AccountType.
 */
export async function createCustomerInIRadius(opts: {
	organizationId: string;
	customerId: string;
	password: string;
}): Promise<{ userId: number }> {
	const customer = await db.customer.findFirst({
		where: { id: opts.customerId, organizationId: opts.organizationId },
		select: {
			externalId: true,
			username: true,
			firstName: true,
			lastName: true,
			email: true,
			phones: true,
			address: true,
			notes: true,
			latitude: true,
			longitude: true,
			monthlyRate: true,
			iptvPrice: true,
			realIpPrice: true,
			discount: true,
			expiresAt: true,
			groupExternalId: true,
			plan: { select: { externalId: true } },
			dealer: { select: { externalId: true } },
			collector: { select: { externalId: true } },
			station: { select: { externalId: true } },
		},
	});
	if (!customer) {
		throw new ORPCError("NOT_FOUND", { message: "Customer not found" });
	}
	if (customer.externalId) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Customer is already linked to iRadius",
		});
	}
	if (!customer.username?.trim()) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Set a username before creating this customer in iRadius",
		});
	}
	if (!customer.plan?.externalId) {
		throw new ORPCError("BAD_REQUEST", {
			message:
				"The customer's plan is not linked to an iRadius account type",
		});
	}

	const num = (v: string | null | undefined): number | null =>
		v ? Number.parseInt(v, 10) : null;

	const { userId } = await iradiusCreateUser({
		userName: customer.username.trim(),
		password: opts.password,
		accountTypeId: Number.parseInt(customer.plan.externalId, 10),
		parentId: num(customer.dealer?.externalId),
		firstName: customer.firstName,
		lastName: customer.lastName,
		mobile: buildIRadiusMobile(customer.phones),
		mailAddress: customer.email,
		address: customer.address,
		comment: customer.notes,
		collectorId: num(customer.collector?.externalId),
		userGroupId: customer.groupExternalId,
		accountPrice: customer.monthlyRate ?? 0,
		discount: customer.discount ?? 0,
		expiryAccount: toMysqlDateTimeUTC(customer.expiresAt),
		iptvPrice: customer.iptvPrice ?? 0,
		realIpPrice: customer.realIpPrice ?? 0,
		gsmLat: customer.latitude,
		gsmLng: customer.longitude,
		stationId: num(customer.station?.externalId),
	});

	return { userId };
}
