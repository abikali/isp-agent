import { ORPCError } from "@orpc/server";
import {
	notifyFieldEmployee,
	notifyOrgForReview,
} from "@repo/api/lib/notify-employee";
import { getUserEmployeeId, requirePermission } from "@repo/api/lib/permission";
import { db, getPrimaryPhone } from "@repo/database";
import { createAccountNumberGenerator } from "@repo/jobs";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { newUserSetupAmount } from "../../billing/lib/cash-signs";
import { resolveActiveBillingMonth } from "../../billing/lib/resolve-month";
import { addonNoteFor } from "../../installations/lib/addons";
import { approveInstallationInTx } from "../../installations/procedures/review";

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
			mobile: z.string().min(1).max(50),
			address: z.string().min(1).max(500),
			groupName: z.string().max(100).optional(),
			collectorId: z.string().optional(),
			planId: z.string(),
			durationType: z.enum(["month", "days"]),
			durationDays: z.number().int().min(1).max(120).optional(),
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

		const plan = await db.servicePlan.findFirst({
			where: { id: input.planId, organizationId: input.organizationId },
			select: { id: true, monthlyPrice: true },
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
					phones: [{ number: input.mobile, primary: true }],
					mobile: getPrimaryPhone([
						{ number: input.mobile, primary: true },
					]),
					address: input.address,
					groupName: input.groupName ?? null,
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
		await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"update",
		);

		const requests = await db.customerSetupRequest.findMany({
			where: {
				organizationId: input.organizationId,
				status: input.status,
			},
			include: {
				customer: {
					select: {
						id: true,
						accountNumber: true,
						firstName: true,
						lastName: true,
						mobile: true,
						address: true,
						groupName: true,
						status: true,
						expiresAt: true,
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
			mobile: z.string().max(50).optional(),
			address: z.string().max(500).optional(),
			groupName: z.string().max(100).nullable().optional(),
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
		await requirePermission(
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
			},
			select: { id: true, customerId: true },
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

		const customerData: Record<string, unknown> = {};
		if (input.firstName !== undefined) {
			customerData["firstName"] = input.firstName;
		}
		if (input.lastName !== undefined) {
			customerData["lastName"] = input.lastName;
		}
		if (input.mobile !== undefined) {
			customerData["mobile"] = input.mobile;
			customerData["phones"] = [{ number: input.mobile, primary: true }];
		}
		if (input.address !== undefined) {
			customerData["address"] = input.address;
		}
		if (input.groupName !== undefined) {
			customerData["groupName"] = input.groupName;
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
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
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
			},
			include: {
				installations: true,
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

		const billingMonth = await resolveActiveBillingMonth(
			input.organizationId,
		);

		await db.$transaction(async (tx) => {
			await tx.customer.update({
				where: { id: request.customerId },
				data: { status: "ACTIVE", activatedAt: new Date() },
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
			if (!existingPayment && request.firstChargeAmount > 0) {
				await tx.payment.create({
					data: {
						organizationId: input.organizationId,
						customerId: request.customerId,
						billingMonthId: billingMonth.id,
						collectorId: request.requestedById,
						accountPrice: request.firstChargeAmount,
						paidAmount: request.firstChargeAmount,
						notes: "New customer setup (field)",
					},
				});
			}

			// Hardware/add-on money the worker collected during setup
			const installTotal = request.installations.reduce(
				(sum, i) => sum + i.price * i.quantity,
				0,
			);
			if (installTotal > 0) {
				await tx.cashCollection.create({
					data: {
						organizationId: input.organizationId,
						collectorId: request.requestedById,
						amount: newUserSetupAmount(installTotal),
						type: "NEW_USER_SETUP",
						receivedById: user.id,
						notes: `New customer setup: ${request.customer.firstName} ${request.customer.lastName ?? ""}`.trim(),
					},
				});
			}
		});

		notifyFieldEmployee({
			organizationId: input.organizationId,
			employeeId: request.requestedById,
			title: "New customer approved",
			message: `${request.customer.firstName} ${request.customer.lastName ?? ""} was approved and activated`,
			type: "success",
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
		await requirePermission(
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
			// Keep the customer for audit, but inactive
			await tx.customer.update({
				where: { id: request.customerId },
				data: { status: "INACTIVE" },
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

		notifyFieldEmployee({
			organizationId: input.organizationId,
			employeeId: request.requestedById,
			title: "New customer rejected",
			message: `${request.customer.firstName} ${request.customer.lastName ?? ""} was rejected${input.reason ? `: ${input.reason}` : ""}`,
			type: "warning",
		}).catch((err: unknown) =>
			logger.warn("[Setup Reject] notify failed", {
				error: String(err),
			}),
		);

		return { success: true };
	});
