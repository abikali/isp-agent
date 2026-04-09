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
import { db, getPrimaryPhone, MAX_PHONES } from "@repo/database";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { iradiusChangeCollector } from "../lib/iradius-api";

export const updateCustomer = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/update",
		tags: ["Customers"],
		summary: "Update a customer",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			firstName: z.string().min(1).max(100).optional(),
			lastName: z.string().max(100).nullable().optional(),
			email: z.string().email().optional(),
			phones: z
				.array(
					z.object({
						number: z.string().max(50),
						primary: z.boolean(),
					}),
				)
				.max(MAX_PHONES)
				.optional(),
			address: z.string().max(500).optional(),
			latitude: z.number().finite().nullable().optional(),
			longitude: z.number().finite().nullable().optional(),
			username: z.string().max(100).optional(),
			planId: z.string().nullable().optional(),
			stationId: z.string().nullable().optional(),
			status: z
				.enum(["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING"])
				.optional(),
			connectionType: z
				.enum(["FIBER", "WIRELESS", "DSL", "CABLE", "ETHERNET"])
				.nullable()
				.optional(),
			ipAddress: z.string().max(45).optional(),
			macAddress: z.string().max(17).optional(),
			monthlyRate: z.number().min(0).nullable().optional(),
			billingDay: z.number().int().min(1).max(28).nullable().optional(),
			balance: z.number().optional(),
			groupName: z.string().max(100).nullable().optional(),
			notes: z.string().max(5000).optional(),
			collectorId: z.string().nullable().optional(),
			// When true AND collectorId changes, also push the new collector
			// assignment to iRadius (User.CollectorId). Defaults to false —
			// most reassignments are local-only per client request.
			syncCollectorToIRadius: z.boolean().optional(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"update",
		);

		const existing = await db.customer.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Customer not found",
			});
		}

		await verifyCustomerOwnership(permCtx, "update", existing.collectorId);

		const updateData: Record<string, unknown> = {};
		if (input.firstName !== undefined) {
			updateData["firstName"] = input.firstName;
			// Also update fullName for backward compat
			const lastName =
				input.lastName !== undefined
					? input.lastName
					: existing.lastName;
			updateData["fullName"] = [input.firstName, lastName]
				.filter(Boolean)
				.join(" ");
		}
		if (input.lastName !== undefined) {
			updateData["lastName"] = input.lastName ?? null;
			if (input.firstName === undefined) {
				updateData["fullName"] = [existing.firstName, input.lastName]
					.filter(Boolean)
					.join(" ");
			}
		}
		if (input.email !== undefined) {
			updateData["email"] = input.email ?? null;
		}
		if (input.phones !== undefined) {
			updateData["phones"] = input.phones;
			updateData["mobile"] = getPrimaryPhone(input.phones);
		}
		if (input.latitude !== undefined) {
			updateData["latitude"] = input.latitude ?? null;
		}
		if (input.longitude !== undefined) {
			updateData["longitude"] = input.longitude ?? null;
		}
		if (input.address !== undefined) {
			updateData["address"] = input.address ?? null;
		}
		if (input.username !== undefined) {
			updateData["username"] = input.username ?? null;
		}
		if (input.planId !== undefined) {
			updateData["planId"] = input.planId ?? null;
		}
		if (input.stationId !== undefined) {
			updateData["stationId"] = input.stationId ?? null;
		}
		if (input.status !== undefined) {
			updateData["status"] = input.status;
		}
		if (input.connectionType !== undefined) {
			updateData["connectionType"] = input.connectionType ?? null;
		}
		if (input.groupName !== undefined) {
			updateData["groupName"] = input.groupName ?? null;
		}
		if (input.ipAddress !== undefined) {
			updateData["ipAddress"] = input.ipAddress ?? null;
		}
		if (input.macAddress !== undefined) {
			updateData["macAddress"] = input.macAddress ?? null;
		}
		if (input.monthlyRate !== undefined) {
			updateData["monthlyRate"] = input.monthlyRate ?? null;
		}
		if (input.billingDay !== undefined) {
			updateData["billingDay"] = input.billingDay ?? null;
		}
		if (input.balance !== undefined) {
			updateData["balance"] = input.balance;
		}
		if (input.notes !== undefined) {
			updateData["notes"] = input.notes ?? null;
		}
		if (input.collectorId !== undefined) {
			if (input.collectorId) {
				const employee = await db.employee.findFirst({
					where: {
						id: input.collectorId,
						organizationId: input.organizationId,
						status: "ACTIVE",
					},
					select: { id: true, name: true, phone: true },
				});
				if (!employee) {
					throw new ORPCError("NOT_FOUND", {
						message: "Collector employee not found or inactive",
					});
				}
				updateData["collectorId"] = input.collectorId;
				updateData["collectorName"] = employee.name;
				updateData["collectorPhone"] = employee.phone ?? null;
			} else {
				updateData["collectorId"] = null;
				updateData["collectorName"] = null;
				updateData["collectorPhone"] = null;
			}
		}

		// iRadius status sync is handled by the customerStatusObserver extension
		// (see packages/database/prisma/extensions/customer-status-observer.ts)
		const customer = await db.customer.update({
			where: { id: input.id },
			data: updateData,
			select: {
				id: true,
				accountNumber: true,
				firstName: true,
				lastName: true,
				email: true,
				status: true,
				createdAt: true,
			},
		});

		// Optional: push collector change to iRadius (opt-in per request;
		// default is local-only).
		if (
			input.syncCollectorToIRadius &&
			input.collectorId !== undefined &&
			input.collectorId !== existing.collectorId &&
			existing.externalId
		) {
			try {
				let collectorIRadiusUserId: number | null = null;
				if (input.collectorId) {
					const collectorEmployee = await db.employee.findFirst({
						where: {
							id: input.collectorId,
							organizationId: input.organizationId,
						},
						select: { externalId: true },
					});
					if (collectorEmployee?.externalId) {
						collectorIRadiusUserId = Number.parseInt(
							collectorEmployee.externalId,
							10,
						);
					}
				}
				await iradiusChangeCollector(
					{ externalId: existing.externalId },
					collectorIRadiusUserId,
				);
			} catch (error) {
				// Local write already succeeded; surface the iRadius failure
				// as a non-fatal warning in the response.
				logger.error("iRadius change collector failed", {
					customerId: input.id,
					error: error instanceof Error ? error.message : error,
				});
				return {
					customer,
					iradiusCollectorSyncError:
						"Failed to sync collector to iRadius",
				};
			}
		}

		const auditContext = getAuditContextFromHeaders(headers);
		customerAudit.updated(
			customer.id,
			user.id,
			input.organizationId,
			auditContext,
		);

		return { customer };
	});
