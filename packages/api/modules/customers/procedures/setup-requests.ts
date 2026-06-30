import { ORPCError } from "@orpc/server";
import {
	notifyAdminTelegram,
	notifyFieldEmployee,
	notifyOrgForReview,
} from "@repo/api/lib/notify-employee";
import {
	getDealerScopeFilter,
	getUserEmployeeId,
	hasPermission,
	requirePermission,
} from "@repo/api/lib/permission";
import { db, getPrimaryPhone, MAX_PHONES } from "@repo/database";
import {
	createAccountNumberGenerator,
	runCreateLocationRequest,
} from "@repo/jobs";
import { logger } from "@repo/logs";
import { getBaseUrl, tgLink, tgMessage } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { newUserSetupAmount } from "../../billing/lib/cash-signs";
import { resolveActiveBillingMonth } from "../../billing/lib/resolve-month";
import { addonNoteFor } from "../../installations/lib/addons";
import { approveInstallationInTx } from "../../installations/procedures/review";
import { createCustomerInIRadius } from "../lib/create-in-iradius";
import { iradiusUsernameExists } from "../lib/iradius-api";

const setupItemSchema = z
	.object({
		stockItemId: z.string().optional(),
		addonType: z.enum(["IPTV", "REAL_IP"]).optional(),
		quantity: z.number().int().min(1).default(1),
		price: z.number().min(0),
	})
	.refine((v) => Boolean(v.stockItemId) !== Boolean(v.addonType), {
		message: "Each line must be either a stock item or an add-on",
	});

const phoneSchema = z.object({
	number: z.string().max(50),
	primary: z.boolean(),
});

/**
 * Form options for the field new-customer screen: active plans, collectors,
 * and customer groups. Gated on `customers:create` (which field techs have)
 * so the worker portal dropdowns populate without granting the broader
 * `servicePlans:read` / `employees:read` / `billing:view` admin permissions.
 */
export const workerCreateOptions = protectedProcedure
	.route({
		method: "GET",
		path: "/customers/worker-create-options",
		tags: ["Customers"],
		summary:
			"Plans, collectors, and groups for the field new-customer form",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"create",
		);
		const dealerScope = getDealerScopeFilter(activeDealerId);

		// Plans and areas are each gated by their own read permission, so an
		// admin can control which roles see them in the field form. Collectors
		// stay tied to the create permission (the form always needs them).
		const canReadPlans = hasPermission(permCtx, "servicePlans", "read");
		const canReadGroups = hasPermission(permCtx, "groups", "read");

		// Per-worker plan visibility: a plan is shown only to the workers
		// explicitly assigned to it. A plan with no `visibleWorkers` rows is
		// hidden from everyone. Resolve the caller's employee id so we can
		// match the allowlist; with no employee id, no plan is visible.
		const employeeId = await getUserEmployeeId(
			input.organizationId,
			user.id,
		);
		const workerVisibilityFilter = employeeId
			? { visibleWorkers: { some: { employeeId } } }
			: { visibleWorkers: { some: { employeeId: "__none__" } } };

		const [plans, collectors, groupRows] = await Promise.all([
			canReadPlans
				? db.servicePlan.findMany({
						where: {
							organizationId: input.organizationId,
							deletedAt: null,
							archived: false,
							...dealerScope,
							...workerVisibilityFilter,
						},
						select: { id: true, name: true, monthlyPrice: true },
						orderBy: { name: "asc" },
					})
				: Promise.resolve([]),
			// Collectors only — billing-department staff or anyone already
			// assigned customers as a collector. Mirrors billing.listCollectors
			// so the field form doesn't list techs/other roles.
			db.employee.findMany({
				where: {
					organizationId: input.organizationId,
					status: "ACTIVE",
					deletedAt: null,
					OR: [
						{ ...dealerScope, department: "BILLING" },
						{ customerCollections: { some: dealerScope } },
					],
				},
				select: { id: true, name: true },
				orderBy: { name: "asc" },
			}),
			canReadGroups
				? db.customer.findMany({
						where: {
							organizationId: input.organizationId,
							groupName: { not: null },
							...dealerScope,
						},
						select: { groupName: true, groupExternalId: true },
						distinct: ["groupName"],
						orderBy: { groupName: "asc" },
					})
				: Promise.resolve([]),
		]);

		return {
			plans,
			collectors,
			// Carry the iRadius UserGroupId (FK) alongside the name. The mirror
			// layer keys off the FK, so the picker must pass it through — name
			// alone is lost on the next sync. Dealer-scoped above, so name→FK is
			// unambiguous here (FK is null only for iRadius-disabled orgs).
			groups: groupRows.flatMap((r) =>
				r.groupName === null
					? []
					: [{ name: r.groupName, externalId: r.groupExternalId }],
			),
		};
	});

/**
 * Worker-created new customer (legacy `is_new=1` flow): creates a PENDING
 * customer + setup request + PENDING installations. Local-only — no iRadius
 * link until an admin links it later, same as `customers.create`.
 */
export const workerCreateCustomer = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/worker-create",
		tags: ["Customers"],
		summary: "Create a new customer from the field (pending approval)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			firstName: z.string().min(1).max(100),
			lastName: z.string().max(100).optional(),
			phones: z.array(phoneSchema).min(1).max(MAX_PHONES),
			address: z.string().min(1).max(500),
			latitude: z.number().finite().gte(-90).lte(90).optional(),
			longitude: z.number().finite().gte(-180).lte(180).optional(),
			// Send the customer a WhatsApp link to share their location after the
			// record is created. Ignored when explicit coordinates are provided
			// (the worker already pinned it on-site).
			requestLocationViaWhatsapp: z.boolean().optional(),
			groupName: z.string().max(100).optional(),
			groupExternalId: z.number().int().optional(),
			collectorId: z.string().optional(),
			planId: z.string(),
			durationType: z.enum(["month", "days"]),
			durationDays: z.number().int().min(1).max(120).optional(),
			notes: z.string().max(2000).optional(),
			items: z.array(setupItemSchema).max(20).default([]),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"create",
		);

		const employeeId = await getUserEmployeeId(
			input.organizationId,
			user.id,
		);
		if (!employeeId) {
			throw new ORPCError("FORBIDDEN", {
				message: "No employee record linked to your account",
			});
		}

		if (input.durationType === "days" && !input.durationDays) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Number of days is required for custom durations",
			});
		}

		const primaryPhone = getPrimaryPhone(input.phones);
		if (!primaryPhone) {
			throw new ORPCError("BAD_REQUEST", {
				message: "At least one phone number is required",
			});
		}

		const plan = await db.servicePlan.findFirst({
			where: { id: input.planId, organizationId: input.organizationId },
			select: { id: true, name: true, monthlyPrice: true },
		});
		if (!plan) {
			throw new ORPCError("NOT_FOUND", { message: "Plan not found" });
		}

		if (input.collectorId) {
			const collector = await db.employee.findFirst({
				where: {
					id: input.collectorId,
					organizationId: input.organizationId,
					deletedAt: null,
				},
				select: { id: true },
			});
			if (!collector) {
				throw new ORPCError("NOT_FOUND", {
					message: "Collector not found",
				});
			}
		}

		// Prorated first charge — legacy used monthly / 30 × days
		const firstChargeAmount =
			input.durationType === "month"
				? plan.monthlyPrice
				: (plan.monthlyPrice / 30) * (input.durationDays as number);

		const addonLines = input.items.filter((i) => i.addonType);
		const requestedAddons = addonLines.map((i) => i.addonType);
		if (new Set(requestedAddons).size !== requestedAddons.length) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Only one of each add-on type",
			});
		}
		const iptvPrice =
			addonLines.find((i) => i.addonType === "IPTV")?.price ?? 0;
		const realIpPrice =
			addonLines.find((i) => i.addonType === "REAL_IP")?.price ?? 0;

		const expiresAt = new Date();
		if (input.durationType === "month") {
			expiresAt.setMonth(expiresAt.getMonth() + 1);
		} else {
			expiresAt.setDate(
				expiresAt.getDate() + (input.durationDays as number),
			);
		}

		const nextAccountNumber = await createAccountNumberGenerator(
			input.organizationId,
		);

		const result = await db.$transaction(async (tx) => {
			const customer = await tx.customer.create({
				data: {
					organizationId: input.organizationId,
					accountNumber: nextAccountNumber(),
					firstName: input.firstName,
					lastName: input.lastName ?? null,
					dealerId: activeDealerId ?? null,
					phones: input.phones,
					mobile: primaryPhone,
					address: input.address,
					latitude: input.latitude ?? null,
					longitude: input.longitude ?? null,
					groupName: input.groupName ?? null,
					groupExternalId: input.groupExternalId ?? null,
					planId: plan.id,
					status: "PENDING",
					monthlyRate: plan.monthlyPrice,
					iptvPrice,
					realIpPrice,
					collectorId: input.collectorId ?? null,
					workerId: employeeId,
					expiresAt,
				},
				select: {
					id: true,
					accountNumber: true,
					firstName: true,
					lastName: true,
				},
			});

			const setupRequest = await tx.customerSetupRequest.create({
				data: {
					organizationId: input.organizationId,
					customerId: customer.id,
					requestedById: employeeId,
					durationType: input.durationType,
					durationDays: input.durationDays ?? null,
					firstChargeAmount,
					notes: input.notes?.trim() || null,
				},
			});

			for (const line of input.items) {
				await tx.installation.create({
					data: {
						organizationId: input.organizationId,
						customerId: customer.id,
						employeeId,
						stockItemId: line.stockItemId ?? null,
						quantity: line.quantity,
						price: line.price,
						isAddOn: Boolean(line.addonType),
						notes: line.addonType
							? addonNoteFor(line.addonType)
							: null,
						setupRequestId: setupRequest.id,
					},
				});
			}

			return { customer, setupRequest };
		});

		const org = await db.organization.findFirst({
			where: { id: input.organizationId },
			select: { slug: true },
		});
		notifyOrgForReview({
			organizationId: input.organizationId,
			title: "New customer awaiting approval",
			message: `${input.firstName} ${input.lastName ?? ""} was created from the field`,
			link: `/app/${org?.slug ?? ""}/customers/approvals`,
			excludeUserIds: [user.id],
		}).catch((err: unknown) =>
			logger.warn("[Worker Create] notify failed", {
				error: String(err),
			}),
		);

		// Admin Telegram alert (opt-in per org) for a new field request.
		const durationLabel =
			input.durationType === "days"
				? `${input.durationDays} days`
				: "1 month";
		const customerName =
			`${input.firstName} ${input.lastName ?? ""}`.trim();
		const addonLabels = input.items
			.filter((i) => i.addonType)
			.map((i) => (i.addonType === "IPTV" ? "IPTV" : "Real IP"));
		const equipmentCount = input.items.filter((i) => i.stockItemId).length;
		const approvalsLink = `${getBaseUrl()}/app/${org?.slug ?? ""}/customers/approvals`;
		notifyAdminTelegram(
			input.organizationId,
			"workerRequest",
			tgMessage({
				icon: "🆕",
				title: "New customer request",
				fields: [
					{ icon: "👤", value: customerName },
					{
						icon: "🔢",
						label: "Account",
						value: result.customer.accountNumber,
						copyable: true,
					},
					{
						icon: "📞",
						label: "Phone",
						value: primaryPhone,
						copyable: true,
					},
					input.address
						? {
								icon: "📍",
								label: "Address",
								value: input.address,
							}
						: null,
					{ icon: "📦", label: "Plan", value: plan.name },
					{ icon: "⏱", label: "Duration", value: durationLabel },
					{
						icon: "💰",
						label: "First charge",
						value: `$${firstChargeAmount.toFixed(2)}`,
						copyable: true,
					},
					addonLabels.length > 0
						? {
								icon: "➕",
								label: "Add-ons",
								value: addonLabels.join(", "),
							}
						: null,
					equipmentCount > 0
						? {
								icon: "🧰",
								label: "Equipment",
								value: `${equipmentCount} item(s)`,
							}
						: null,
					input.notes
						? { icon: "✍️", label: "Note", value: input.notes }
						: null,
					{ icon: "👷", label: "By", value: user.name },
				],
				footer: tgLink("Review & approve →", approvalsLink),
			}),
		);

		// Optional: ask the customer to share their location over WhatsApp.
		// Only when the worker didn't already pin it on-site. Fire-and-forget —
		// a WhatsApp hiccup must not fail the customer creation.
		if (
			input.requestLocationViaWhatsapp &&
			input.latitude === undefined &&
			input.longitude === undefined
		) {
			runCreateLocationRequest({
				organizationId: input.organizationId,
				customerId: result.customer.id,
				createdById: user.id,
			}).catch((err: unknown) =>
				logger.warn("[Worker Create] location request failed", {
					error: String(err),
				}),
			);
		}

		return result;
	});

export const listSetupRequests = protectedProcedure
	.route({
		method: "GET",
		path: "/customers/setup-requests",
		tags: ["Customers"],
		summary: "List worker-created customers awaiting approval",
	})
	.input(
		z.object({
			organizationId: z.string(),
			status: z
				.enum(["PENDING", "APPROVED", "REJECTED"])
				.default("PENDING"),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"update",
		);

		const requests = await db.customerSetupRequest.findMany({
			where: {
				organizationId: input.organizationId,
				status: input.status,
				customer: getDealerScopeFilter(activeDealerId),
			},
			include: {
				customer: {
					select: {
						id: true,
						accountNumber: true,
						firstName: true,
						lastName: true,
						mobile: true,
						phones: true,
						address: true,
						groupName: true,
						groupExternalId: true,
						username: true,
						status: true,
						expiresAt: true,
						externalId: true,
						plan: { select: { id: true, name: true } },
						collector: { select: { id: true, name: true } },
					},
				},
				requestedBy: { select: { id: true, name: true } },
				reviewedBy: { select: { id: true, name: true } },
				installations: {
					include: {
						stockItem: { select: { id: true, name: true } },
					},
				},
			},
			orderBy: { createdAt: "desc" },
		});

		return { requests, total: requests.length };
	});

/**
 * Edit a pending worker-created customer before approving — legacy
 * `adm_new.php` parity (name, group, contact, plan, prices, collector,
 * discount, expiry, first charge).
 */
export const updateSetupRequest = protectedProcedure
	.route({
		method: "PATCH",
		path: "/customers/setup-requests/{id}",
		tags: ["Customers"],
		summary: "Edit a pending setup request before approval",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			firstName: z.string().min(1).max(100).optional(),
			lastName: z.string().max(100).nullable().optional(),
			phones: z.array(phoneSchema).min(1).max(MAX_PHONES).optional(),
			address: z.string().max(500).optional(),
			groupName: z.string().max(100).nullable().optional(),
			groupExternalId: z.number().int().nullable().optional(),
			username: z.string().trim().min(1).max(100).optional(),
			planId: z.string().optional(),
			collectorId: z.string().nullable().optional(),
			monthlyRate: z.number().min(0).optional(),
			iptvPrice: z.number().min(0).optional(),
			realIpPrice: z.number().min(0).optional(),
			discount: z.number().min(0).optional(),
			expiresAt: z.coerce.date().optional(),
			firstChargeAmount: z.number().min(0).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId, iradiusDisabled } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"update",
		);

		const request = await db.customerSetupRequest.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				status: "PENDING",
				customer: getDealerScopeFilter(activeDealerId),
			},
			select: {
				id: true,
				customerId: true,
				customer: { select: { username: true } },
			},
		});
		if (!request) {
			throw new ORPCError("NOT_FOUND", {
				message: "Setup request not found or already reviewed",
			});
		}

		if (input.planId) {
			const plan = await db.servicePlan.findFirst({
				where: {
					id: input.planId,
					organizationId: input.organizationId,
				},
				select: { id: true },
			});
			if (!plan) {
				throw new ORPCError("NOT_FOUND", { message: "Plan not found" });
			}
		}
		if (input.collectorId) {
			const collector = await db.employee.findFirst({
				where: {
					id: input.collectorId,
					organizationId: input.organizationId,
					deletedAt: null,
				},
				select: { id: true },
			});
			if (!collector) {
				throw new ORPCError("NOT_FOUND", {
					message: "Collector not found",
				});
			}
		}

		// Re-validate a newly-assigned username against iRadius (defense in
		// depth — the dialog checks on blur, but never trust the client). Only
		// re-check when it actually changed: the stored value isn't pushed to
		// iRadius, so re-saving an unchanged username must not block edits.
		if (
			input.username !== undefined &&
			input.username !== request.customer.username &&
			!iradiusDisabled &&
			(await iradiusUsernameExists(input.username))
		) {
			throw new ORPCError("CONFLICT", {
				message: `Username "${input.username}" already exists on iRadius`,
			});
		}

		const customerData: Record<string, unknown> = {};
		if (input.username !== undefined) {
			customerData["username"] = input.username;
		}
		if (input.firstName !== undefined) {
			customerData["firstName"] = input.firstName;
		}
		if (input.lastName !== undefined) {
			customerData["lastName"] = input.lastName;
		}
		if (input.phones !== undefined) {
			customerData["phones"] = input.phones;
			customerData["mobile"] = getPrimaryPhone(input.phones);
		}
		if (input.address !== undefined) {
			customerData["address"] = input.address;
		}
		if (input.groupName !== undefined) {
			customerData["groupName"] = input.groupName;
		}
		if (input.groupExternalId !== undefined) {
			customerData["groupExternalId"] = input.groupExternalId;
		}
		if (input.planId !== undefined) {
			customerData["planId"] = input.planId;
		}
		if (input.collectorId !== undefined) {
			customerData["collectorId"] = input.collectorId;
		}
		if (input.monthlyRate !== undefined) {
			customerData["monthlyRate"] = input.monthlyRate;
		}
		if (input.iptvPrice !== undefined) {
			customerData["iptvPrice"] = input.iptvPrice;
		}
		if (input.realIpPrice !== undefined) {
			customerData["realIpPrice"] = input.realIpPrice;
		}
		if (input.discount !== undefined) {
			customerData["discount"] = input.discount;
		}
		if (input.expiresAt !== undefined) {
			customerData["expiresAt"] = input.expiresAt;
		}

		const updated = await db.$transaction(async (tx) => {
			if (Object.keys(customerData).length > 0) {
				await tx.customer.update({
					where: { id: request.customerId },
					data: customerData,
				});
			}
			if (input.firstChargeAmount !== undefined) {
				return tx.customerSetupRequest.update({
					where: { id: request.id },
					data: { firstChargeAmount: input.firstChargeAmount },
				});
			}
			return tx.customerSetupRequest.findUniqueOrThrow({
				where: { id: request.id },
			});
		});

		return { request: updated };
	});

/**
 * Read-only availability check for an iRadius username. Backs the live "is
 * this taken?" feedback in the Edit-Before-Approval dialog. Returns
 * `available: true` for iRadius-disabled orgs (no legacy system to collide
 * with). Read-only — never writes to iRadius.
 */
export const checkIradiusUsername = protectedProcedure
	.route({
		method: "GET",
		path: "/customers/setup-requests/check-username",
		tags: ["Customers"],
		summary: "Check whether a username is already taken on iRadius",
	})
	.input(
		z.object({
			organizationId: z.string(),
			username: z.string().trim().min(1).max(100),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { iradiusDisabled } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"update",
		);
		if (iradiusDisabled) {
			return { available: true };
		}
		const exists = await iradiusUsernameExists(input.username);
		return { available: !exists };
	});

export const approveSetupRequest = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/setup-requests/{id}/approve",
		tags: ["Customers"],
		summary:
			"Approve a worker-created customer (activates + records first payment)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			// PPPoE password for the new iRadius subscriber. Required when the org
			// uses iRadius and the customer isn't linked yet (the common case for
			// app-created customers); ignored when already linked / iRadius off.
			iradiusPassword: z.string().min(1).max(100).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId, iradiusDisabled } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"update",
		);
		await requirePermission(
			input.organizationId,
			user.id,
			"installations",
			"approve",
		);

		const request = await db.customerSetupRequest.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				status: "PENDING",
				customer: getDealerScopeFilter(activeDealerId),
			},
			include: {
				installations: true,
				customer: {
					select: {
						id: true,
						accountNumber: true,
						firstName: true,
						lastName: true,
						username: true,
						externalId: true,
					},
				},
			},
		});
		if (!request) {
			throw new ORPCError("NOT_FOUND", {
				message: "Setup request not found or already reviewed",
			});
		}

		// A username is mandatory before activation — it's the iRadius login the
		// account will be linked to. Enforced here (not just in the dialog) so a
		// direct approve from the list can't skip it.
		if (!request.customer.username?.trim()) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Set a username before approving this customer",
			});
		}

		// Create the subscriber in iRadius (remote-first) for app-created
		// customers that aren't linked yet. On success we store the returned
		// User.Id as externalId in the transaction below so the customer mirrors
		// like any synced one. If the remote create fails, the whole approval
		// aborts — no half-approved local state.
		const shouldCreateInIRadius =
			!iradiusDisabled && !request.customer.externalId;
		let newExternalId: string | null = null;
		if (shouldCreateInIRadius) {
			if (!input.iradiusPassword?.trim()) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"A PPPoE password is required to create this customer in iRadius",
				});
			}
			const { userId } = await createCustomerInIRadius({
				organizationId: input.organizationId,
				customerId: request.customerId,
				password: input.iradiusPassword.trim(),
			});
			newExternalId = String(userId);
		}

		const billingMonth = await resolveActiveBillingMonth(
			input.organizationId,
		);

		await db.$transaction(async (tx) => {
			await tx.customer.update({
				where: { id: request.customerId },
				data: {
					status: "ACTIVE",
					activatedAt: new Date(),
					...(newExternalId ? { externalId: newExternalId } : {}),
				},
			});

			await tx.customerSetupRequest.update({
				where: { id: request.id },
				data: {
					status: "APPROVED",
					reviewedById: user.id,
					reviewedAt: new Date(),
				},
			});

			// Approve the bundled installations. No per-line cash entries —
			// the hardware money is logged once as NEW_USER_SETUP below.
			for (const installation of request.installations) {
				if (installation.status !== "PENDING") {
					continue;
				}
				await approveInstallationInTx(tx, installation, user.id, {
					createCashEntry: false,
				});
			}

			// First subscription payment, collected by the worker in the field
			const existingPayment = await tx.payment.findFirst({
				where: {
					customerId: request.customerId,
					billingMonthId: billingMonth.id,
					OR: [
						{ paidAmount: { gt: 0 } },
						{ freeAccount: true },
						{ stoppedAccount: true },
					],
				},
				select: { id: true },
			});
			// The worker only holds the subscription cash when this approval is
			// the entry recording it. If a payment already exists (first month
			// settled elsewhere), the worker never took that cash — so the
			// subscription debit below is bound to the same condition.
			const workerCollectedSubscription =
				!existingPayment && request.firstChargeAmount > 0;
			if (workerCollectedSubscription) {
				await tx.payment.create({
					data: {
						organizationId: input.organizationId,
						customerId: request.customerId,
						billingMonthId: billingMonth.id,
						collectorId: request.requestedById,
						accountPrice: request.firstChargeAmount,
						paidAmount: request.firstChargeAmount,
						notes: "New customer setup (field)",
						// The approving admin has, by definition, just reviewed
						// this payment. Stamp it so the setup note doesn't make it
						// surface in the "needs review" queue (review-status.ts
						// flags any unreviewed payment carrying a note).
						reviewedAt: new Date(),
					},
				});
			}

			// Cash the worker physically collected during setup: hardware/add-on
			// money plus the first subscription charge (when the worker took it).
			// Logged once as a single negative NEW_USER_SETUP entry so it lands
			// in the worker's wallet and an admin can hand it off. Mirrors legacy
			// adm_new.php, which debits the worker for both the subscription
			// (account_price) and the installed hardware on approval.
			//
			// NOTE: the matching Payment carries collectorId = worker / workerId
			// = null, so it would also count in fetchCollectorBalance(worker).
			// Workers render via fetchWorkerBalance (cash only), so it's invisible
			// today — but giving a worker a collector layout would double-count
			// this subscription cash. Keep the two lenses in mind before then.
			const installTotal = request.installations.reduce(
				(sum, i) => sum + i.price * i.quantity,
				0,
			);
			const workerCash =
				installTotal +
				(workerCollectedSubscription ? request.firstChargeAmount : 0);
			if (workerCash > 0) {
				await tx.cashCollection.create({
					data: {
						organizationId: input.organizationId,
						collectorId: request.requestedById,
						amount: newUserSetupAmount(workerCash),
						type: "NEW_USER_SETUP",
						receivedById: user.id,
						notes: `New customer setup: ${request.customer.firstName} ${request.customer.lastName ?? ""}`.trim(),
					},
				});
			}
		});

		const approvedName =
			`${request.customer.firstName} ${request.customer.lastName ?? ""}`.trim();
		notifyFieldEmployee({
			organizationId: input.organizationId,
			employeeId: request.requestedById,
			title: "New customer approved",
			message: `${approvedName} was approved and activated`,
			type: "success",
			telegramText: tgMessage({
				icon: "✅",
				title: "Customer approved & activated",
				fields: [
					{ icon: "👤", value: approvedName },
					{
						icon: "🔢",
						label: "Account",
						value: request.customer.accountNumber,
						copyable: true,
					},
					request.customer.username
						? {
								icon: "🆔",
								label: "Username",
								value: request.customer.username,
								copyable: true,
							}
						: null,
				],
			}),
		}).catch((err: unknown) =>
			logger.warn("[Setup Approve] notify failed", {
				error: String(err),
			}),
		);

		return { success: true };
	});

export const rejectSetupRequest = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/setup-requests/{id}/reject",
		tags: ["Customers"],
		summary: "Reject a worker-created customer",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			reason: z.string().max(500).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"update",
		);

		const request = await db.customerSetupRequest.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				status: "PENDING",
				customer: getDealerScopeFilter(activeDealerId),
			},
			include: {
				customer: {
					select: { id: true, firstName: true, lastName: true },
				},
			},
		});
		if (!request) {
			throw new ORPCError("NOT_FOUND", {
				message: "Setup request not found or already reviewed",
			});
		}

		await db.$transaction(async (tx) => {
			await tx.customerSetupRequest.update({
				where: { id: request.id },
				data: {
					status: "REJECTED",
					reviewedById: user.id,
					reviewedAt: new Date(),
					rejectedReason: input.reason ?? null,
				},
			});
			// Keep the customer row for audit/back-references, but soft-delete it
			// so it drops out of the default customers list (which filters on
			// `deletedAt: null`). It was never approved into iRadius, so there is
			// nothing remote to clean up.
			await tx.customer.update({
				where: { id: request.customerId },
				data: { status: "INACTIVE", deletedAt: new Date() },
			});
			await tx.installation.updateMany({
				where: { setupRequestId: request.id, status: "PENDING" },
				data: {
					status: "DENIED",
					approvedById: user.id,
					approvedAt: new Date(),
				},
			});
		});

		const rejectedName =
			`${request.customer.firstName} ${request.customer.lastName ?? ""}`.trim();
		notifyFieldEmployee({
			organizationId: input.organizationId,
			employeeId: request.requestedById,
			title: "New customer rejected",
			message: `${rejectedName} was rejected${input.reason ? `: ${input.reason}` : ""}`,
			type: "warning",
			telegramText: tgMessage({
				icon: "⛔",
				title: "Customer rejected",
				fields: [
					{ icon: "👤", value: rejectedName },
					input.reason
						? { icon: "✍️", label: "Reason", value: input.reason }
						: null,
				],
			}),
		}).catch((err: unknown) =>
			logger.warn("[Setup Reject] notify failed", {
				error: String(err),
			}),
		);

		return { success: true };
	});
