import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
	verifyCustomerOwnership,
} from "@repo/api/lib/permission";
import {
	customerAudit,
	getAuditContextFromHeaders,
} from "@repo/auth/lib/audit";
import { db, type Prisma } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	iradiusSetApElectrical,
	iradiusSetExpiryAccount,
	iradiusSetIptvPrice,
	iradiusSetRecurringDiscount,
	iradiusUpdateUserName,
} from "../lib/iradius-api";
import { mirrorToIRadius } from "../lib/iradius-mirror";
import { resetMacForCustomer } from "../lib/reset-mac";

const baseInput = z.object({
	organizationId: z.string(),
	customerId: z.string(),
});

interface LinkedCustomer {
	id: string;
	externalId: string;
	username: string | null;
	collectorId: string | null;
	macAddress: string | null;
}

async function loadLinkedCustomer(opts: {
	organizationId: string;
	customerId: string;
	activeDealerId: string | null;
	/** Return an unlinked customer too (externalId empty) instead of refusing. */
	allowUnlinked?: boolean;
}): Promise<LinkedCustomer> {
	const customer = await db.customer.findFirst({
		where: {
			id: opts.customerId,
			organizationId: opts.organizationId,
			...getDealerScopeFilter(opts.activeDealerId),
		},
		select: {
			id: true,
			externalId: true,
			username: true,
			collectorId: true,
			macAddress: true,
		},
	});
	if (!customer) {
		throw new ORPCError("NOT_FOUND", { message: "Customer not found" });
	}
	if (!customer.externalId) {
		if (opts.allowUnlinked) {
			return { ...customer, externalId: "" };
		}
		throw new ORPCError("BAD_REQUEST", {
			message: "Customer is not linked to iRadius",
		});
	}
	return customer as LinkedCustomer;
}

/**
 * Permission → iRadius enabled → linked customer → ownership. Shared by every
 * direct-SQL iRadius admin action.
 */
async function authorizeIRadiusAdminAction(opts: {
	organizationId: string;
	customerId: string;
	userId: string;
	/**
	 * For a field that also means something locally: an unlinked customer or
	 * an iRadius-disabled org gets the local write only, instead of an error.
	 */
	localOnlyWhenUnlinked?: boolean;
}): Promise<LinkedCustomer & { iradiusDisabled: boolean }> {
	const { permCtx, activeDealerId, iradiusDisabled } =
		await requirePermission(
			opts.organizationId,
			opts.userId,
			"customers",
			"update",
		);
	if (iradiusDisabled && !opts.localOnlyWhenUnlinked) {
		throw new ORPCError("BAD_REQUEST", {
			message: "iRadius is disabled for this organization",
		});
	}
	const customer = await loadLinkedCustomer({
		organizationId: opts.organizationId,
		customerId: opts.customerId,
		activeDealerId,
		allowUnlinked: opts.localOnlyWhenUnlinked === true,
	});
	await verifyCustomerOwnership(permCtx, "update", customer.collectorId);
	return { ...customer, iradiusDisabled: Boolean(iradiusDisabled) };
}

/**
 * Shared lifecycle for the direct-SQL iRadius admin actions:
 *   authorize → iRadius write → local mirror → audit.
 */
async function runIRadiusAdminAction(opts: {
	organizationId: string;
	customerId: string;
	userId: string;
	headers: Headers;
	failureMessage: string;
	logTag: string;
	mutate: (customer: LinkedCustomer) => Promise<{ affectedRows: number }>;
	localData: Prisma.CustomerUpdateInput;
	localOnlyWhenUnlinked?: boolean;
}): Promise<{ success: true }> {
	const customer = await authorizeIRadiusAdminAction(opts);

	await mirrorToIRadius({
		iradiusDisabled: customer.iradiusDisabled || !customer.externalId,
		logTag: opts.logTag,
		failureMessage: opts.failureMessage,
		remote: async () => {
			const result = await opts.mutate(customer);
			if (result.affectedRows !== 1) {
				throw new Error(
					`Expected 1 row updated, got ${result.affectedRows}`,
				);
			}
		},
		local: () =>
			db.customer.update({
				where: { id: opts.customerId },
				data: opts.localData,
			}),
	});

	customerAudit.updated(
		opts.customerId,
		opts.userId,
		opts.organizationId,
		getAuditContextFromHeaders(opts.headers),
	);

	return { success: true };
}

export const resetCustomerMacAddress = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/reset-mac-address",
		tags: ["Customers"],
		summary: "Reset a customer's MAC address in iRadius",
	})
	.input(baseInput)
	.handler(async ({ context: { user, headers }, input }) => {
		const customer = await authorizeIRadiusAdminAction({
			organizationId: input.organizationId,
			customerId: input.customerId,
			userId: user.id,
		});
		await resetMacForCustomer({
			organizationId: input.organizationId,
			customer,
			actorUserId: user.id,
			auditContext: getAuditContextFromHeaders(headers),
			metadata: { via: "app", previousMac: customer.macAddress },
		});
		return { success: true as const };
	});

export const updateCustomerNameInIRadius = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/update-name",
		tags: ["Customers"],
		summary: "Update a customer's first/last name locally and in iRadius",
	})
	.input(
		baseInput.extend({
			firstName: z.string().trim().min(1).max(255),
			lastName: z.string().trim().max(255).default(""),
		}),
	)
	.handler(({ context: { user, headers }, input }) =>
		runIRadiusAdminAction({
			organizationId: input.organizationId,
			customerId: input.customerId,
			userId: user.id,
			headers,
			failureMessage: "Failed to update name in iRadius",
			logTag: "iRadius update name",
			mutate: (customer) =>
				iradiusUpdateUserName(
					customer,
					input.firstName,
					input.lastName,
				),
			localData: {
				firstName: input.firstName,
				lastName: input.lastName || null,
			},
		}),
	);

export const setCustomerRecurringDiscount = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/set-discount",
		tags: ["Customers"],
		summary:
			"Set a customer's recurring discount in iRadius (applied to future invoices)",
	})
	.input(
		baseInput.extend({
			discount: z.number().finite().min(0),
		}),
	)
	.handler(({ context: { user, headers }, input }) =>
		runIRadiusAdminAction({
			organizationId: input.organizationId,
			customerId: input.customerId,
			userId: user.id,
			headers,
			failureMessage: "Failed to set discount in iRadius",
			logTag: "iRadius set discount",
			mutate: (customer) =>
				iradiusSetRecurringDiscount(customer, input.discount),
			localData: { discount: input.discount },
		}),
	);

export const setCustomerExpiryDate = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/set-expiry-date",
		tags: ["Customers"],
		summary:
			"Set a customer's billing expiry date in iRadius (UserNas.ExpiryAccount)",
	})
	.input(
		baseInput.extend({
			/** YYYY-MM-DD. Pass null to clear. */
			expiryDate: z
				.string()
				.regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
				.nullable(),
		}),
	)
	.handler(({ context: { user, headers }, input }) => {
		// End-of-day 23:59:00 matches iRadius' usual billing-cycle expiry time.
		// Both sides store the same tz-naive literal.
		const mysqlDateTime = input.expiryDate
			? `${input.expiryDate} 23:59:00`
			: null;
		const localDate = input.expiryDate
			? new Date(`${input.expiryDate}T23:59:00.000Z`)
			: null;

		return runIRadiusAdminAction({
			organizationId: input.organizationId,
			customerId: input.customerId,
			userId: user.id,
			headers,
			failureMessage: "Failed to set expiry date in iRadius",
			logTag: "iRadius set expiry date",
			mutate: (customer) =>
				iradiusSetExpiryAccount(customer, mysqlDateTime),
			localData: { expiresAt: localDate },
		});
	});

export const setCustomerIptvPrice = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/set-iptv-price",
		tags: ["Customers"],
		summary: "Set a customer's IPTV price in iRadius",
	})
	.input(
		baseInput.extend({
			iptvPrice: z.number().finite().min(0),
		}),
	)
	.handler(({ context: { user, headers }, input }) =>
		runIRadiusAdminAction({
			organizationId: input.organizationId,
			customerId: input.customerId,
			userId: user.id,
			headers,
			failureMessage: "Failed to set IPTV price in iRadius",
			logTag: "iRadius set IPTV price",
			mutate: (customer) =>
				iradiusSetIptvPrice(customer, input.iptvPrice),
			localData: { iptvPrice: input.iptvPrice },
		}),
	);

export const setCustomerApElectrical = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/set-ap-electrical",
		tags: ["Customers"],
		summary:
			"Set whether the customer powers our access point (iRadius UserNas.APElectrical)",
	})
	.input(baseInput.extend({ value: z.boolean() }))
	.handler(({ context: { user, headers }, input }) =>
		runIRadiusAdminAction({
			organizationId: input.organizationId,
			customerId: input.customerId,
			userId: user.id,
			headers,
			failureMessage: "Failed to set AP Electrical in iRadius",
			logTag: "iRadius set AP electrical",
			mutate: (customer) => iradiusSetApElectrical(customer, input.value),
			localData: { apElectrical: input.value },
			localOnlyWhenUnlinked: true,
		}),
	);
