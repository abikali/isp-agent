import { ORPCError } from "@orpc/server";
import { buildIRadiusMobile, db } from "@repo/database";
import {
	iradiusCreateUser,
	iradiusUpdateUserAddress,
	iradiusUpdateUserComment,
	iradiusUpdateUserName,
} from "./iradius-api";

/** True when `s` holds any non-ASCII char (e.g. Arabic). */
function hasNonAscii(s: string | null | undefined): boolean {
	if (typeof s !== "string") {
		return false;
	}
	for (const ch of s) {
		if ((ch.codePointAt(0) ?? 0) > 0x7f) {
			return true;
		}
	}
	return false;
}

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

	// The patched `/create-user` endpoint writes through a non-UTF-8 JDBC
	// connection, so any non-ASCII text (Arabic names/address/notes) lands in
	// iRadius as "????". Re-write just those fields through our utf8mb4 mirror
	// tunnel, which stores correct UTF-8 in the (utf8) columns. Only fires when
	// a field actually contains non-ASCII, so Latin-only creates pay nothing.
	const linked = { externalId: String(userId) };
	if (hasNonAscii(customer.firstName) || hasNonAscii(customer.lastName)) {
		await iradiusUpdateUserName(
			linked,
			customer.firstName ?? "",
			customer.lastName ?? "",
		);
	}
	if (hasNonAscii(customer.address)) {
		await iradiusUpdateUserAddress(linked, customer.address);
	}
	if (hasNonAscii(customer.notes)) {
		await iradiusUpdateUserComment(linked, customer.notes);
	}

	return { userId };
}
