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
import { beirutEndOfDay } from "../../../lib/beirut-time";
import { protectedProcedure } from "../../../orpc/procedures";
import { DealerCreditError } from "../../dealers/lib/iradius-dealer";
import {
	iradiusResetMacAddress,
	iradiusSetExpiryAccount,
	iradiusSetIptvPrice,
	iradiusSetRecurringDiscount,
	iradiusUpdateUserName,
} from "../lib/iradius-api";
import {
	ExtraTimePastTargetError,
	iradiusAddExtraTime,
	iradiusReadExtraTimeContext,
	planExtraTime,
} from "../lib/iradius-extra-time";
import { mirrorToIRadius } from "../lib/iradius-mirror";

const baseInput = z.object({
	organizationId: z.string(),
	customerId: z.string(),
});

interface LinkedCustomer {
	id: string;
	externalId: string;
	username: string | null;
	collectorId: string | null;
}

async function loadLinkedCustomer(opts: {
	organizationId: string;
	customerId: string;
	activeDealerId: string | null;
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
		},
	});
	if (!customer) {
		throw new ORPCError("NOT_FOUND", { message: "Customer not found" });
	}
	if (!customer.externalId) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Customer is not linked to iRadius",
		});
	}
	return customer as LinkedCustomer;
}

/**
 * Shared lifecycle for the four direct-SQL iRadius admin actions:
 *   permission → ownership → iRadius write → local mirror → audit.
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
}): Promise<{ success: true }> {
	const { permCtx, activeDealerId, iradiusDisabled } =
		await requirePermission(
			opts.organizationId,
			opts.userId,
			"customers",
			"update",
		);
	if (iradiusDisabled) {
		throw new ORPCError("BAD_REQUEST", {
			message: "iRadius is disabled for this organization",
		});
	}
	const customer = await loadLinkedCustomer({
		organizationId: opts.organizationId,
		customerId: opts.customerId,
		activeDealerId,
	});
	await verifyCustomerOwnership(permCtx, "update", customer.collectorId);

	await mirrorToIRadius({
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
	.handler(({ context: { user, headers }, input }) =>
		runIRadiusAdminAction({
			organizationId: input.organizationId,
			customerId: input.customerId,
			userId: user.id,
			headers,
			failureMessage: "Failed to reset MAC address in iRadius",
			logTag: "iRadius reset MAC",
			mutate: (customer) => iradiusResetMacAddress(customer),
			localData: { macAddress: null },
		}),
	);

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

const expiryDateInput = baseInput.extend({
	/** YYYY-MM-DD. Pass null to clear. */
	expiryDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
		.nullable(),
	/**
	 * Charge the dealer the prorated wholesale price for days added
	 * (native "Add Day … Manage Dealer Credit"). Only the wholesale
	 * operator may turn it off; every other org always charges.
	 */
	chargeDealer: z.boolean().optional(),
});

async function resolveChargeDealer(
	organizationId: string,
	requested: boolean | undefined,
): Promise<{ chargeDealer: boolean; canToggleCharge: boolean }> {
	const org = await db.organization.findUnique({
		where: { id: organizationId },
		select: { isWholesaleOperator: true },
	});
	const canToggleCharge = org?.isWholesaleOperator === true;
	return {
		canToggleCharge,
		chargeDealer: canToggleCharge ? (requested ?? true) : true,
	};
}

/**
 * What "Set billing expiry" would do in iRadius: how many days it adds and
 * what the dealer is charged for them. Read-only.
 */
export const previewCustomerExpiryDate = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/set-expiry-date/preview",
		tags: ["Customers"],
		summary:
			"Preview the days added and dealer charge of setting a billing expiry date",
	})
	.input(
		baseInput.extend({
			expiryDate: z
				.string()
				.regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId, iradiusDisabled } =
			await requirePermission(
				input.organizationId,
				user.id,
				"customers",
				"update",
			);
		if (iradiusDisabled) {
			throw new ORPCError("BAD_REQUEST", {
				message: "iRadius is disabled for this organization",
			});
		}
		const customer = await loadLinkedCustomer({
			organizationId: input.organizationId,
			customerId: input.customerId,
			activeDealerId,
		});
		await verifyCustomerOwnership(permCtx, "update", customer.collectorId);

		const ctx = await iradiusReadExtraTimeContext(customer.externalId);
		const plan = planExtraTime(ctx, input.expiryDate, new Date());
		const forward =
			!plan.atTarget &&
			plan.days >= 0 &&
			!(plan.oldExpiry && plan.oldExpiry > plan.newExpiry);
		const dealer =
			ctx.parentId !== null
				? await db.ispDealer.findUnique({
						where: { externalId: String(ctx.parentId) },
						select: { name: true, username: true },
					})
				: null;
		const { canToggleCharge } = await resolveChargeDealer(
			input.organizationId,
			undefined,
		);
		return {
			currentExpiry: plan.oldExpiry,
			forward,
			days: forward ? plan.days : 0,
			dealerName:
				dealer?.username ??
				dealer?.name ??
				(ctx.parentId ? `#${ctx.parentId}` : null),
			rate: ctx.rate,
			periodHours: plan.periodHours,
			charge: forward ? plan.dealerCharge : 0,
			credit: ctx.dealerCredit,
			noCharge: ctx.noCharge,
			canToggleCharge,
		};
	});

export const setCustomerExpiryDate = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/set-expiry-date",
		tags: ["Customers"],
		summary:
			"Set a customer's billing expiry date in iRadius (UserNas.ExpiryAccount), charging the dealer for added days",
	})
	.input(expiryDateInput)
	.handler(async ({ context: { user, headers }, input }) => {
		// End-of-day 23:59 Beirut, iRadius' usual billing-cycle expiry time:
		// iRadius stores the naive literal, Postgres the same instant in UTC.
		const end = input.expiryDate ? beirutEndOfDay(input.expiryDate) : null;
		const { chargeDealer } = await resolveChargeDealer(
			input.organizationId,
			input.chargeDealer,
		);
		let added: { days: number; dealerCharge: number } | null = null;

		const result = await runIRadiusAdminAction({
			organizationId: input.organizationId,
			customerId: input.customerId,
			userId: user.id,
			headers,
			failureMessage: "Failed to set expiry date in iRadius",
			logTag: "iRadius set expiry date",
			mutate: async (customer) => {
				if (input.expiryDate) {
					// Moving the expiry forward goes through the charged path
					// (days are never free unless the operator says so).
					// Backwards stays a bare UPDATE — no refund in v1.
					try {
						const r = await iradiusAddExtraTime({
							externalId: customer.externalId,
							targetExpiry: input.expiryDate,
							chargeDealer,
							reason: "Set billing expiry",
						});
						added = { days: r.days, dealerCharge: r.dealerCharge };
						return { affectedRows: 1 };
					} catch (error) {
						if (error instanceof DealerCreditError) {
							throw new ORPCError("BAD_REQUEST", {
								message: error.message,
							});
						}
						if (!(error instanceof ExtraTimePastTargetError)) {
							throw error;
						}
					}
				}
				return iradiusSetExpiryAccount(customer, end?.literal ?? null);
			},
			localData: { expiresAt: end?.utc ?? null },
		});
		const summary = added as { days: number; dealerCharge: number } | null;
		return {
			...result,
			daysAdded: summary?.days ?? 0,
			dealerCharge: summary?.dealerCharge ?? 0,
		};
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
