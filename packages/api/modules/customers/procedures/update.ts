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
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { iradiusSetActive } from "../lib/iradius-api";
import { mirrorToIRadius } from "../lib/iradius-mirror";
import {
	diffMirrorFields,
	pushMirrorDiffToIRadius,
} from "../lib/mirror-fields";

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
			monthlyRate: z.number().min(0).nullable().optional(),
			balance: z.number().optional(),
			groupName: z.string().max(100).nullable().optional(),
			groupExternalId: z.number().int().nullable().optional(),
			notes: z.string().max(5000).optional(),
			collectorId: z.string().nullable().optional(),
			discount: z.number().finite().min(0).optional(),
			iptvPrice: z.number().finite().min(0).optional(),
			realIpPrice: z.number().finite().min(0).optional(),
			deductMoney: z.number().finite().nullable().optional(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { permCtx, activeDealerId, iradiusDisabled } =
			await requirePermission(
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
		}
		if (input.lastName !== undefined) {
			updateData["lastName"] = input.lastName ?? null;
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
		if (input.groupExternalId !== undefined) {
			updateData["groupExternalId"] = input.groupExternalId ?? null;
		}
		if (input.monthlyRate !== undefined) {
			updateData["monthlyRate"] = input.monthlyRate ?? null;
		}
		if (input.balance !== undefined) {
			updateData["balance"] = input.balance;
		}
		if (input.notes !== undefined) {
			updateData["notes"] = input.notes ?? null;
		}
		if (input.discount !== undefined) {
			updateData["discount"] = input.discount;
		}
		if (input.iptvPrice !== undefined) {
			updateData["iptvPrice"] = input.iptvPrice;
		}
		if (input.realIpPrice !== undefined) {
			updateData["realIpPrice"] = input.realIpPrice;
		}
		if (input.deductMoney !== undefined) {
			updateData["deductMoney"] = input.deductMoney ?? null;
		}
		let collectorEmployee: {
			name: string;
			phone: string | null;
			externalId: string | null;
		} | null = null;
		if (input.collectorId !== undefined) {
			if (input.collectorId) {
				collectorEmployee = await db.employee.findFirst({
					where: {
						id: input.collectorId,
						organizationId: input.organizationId,
						status: "ACTIVE",
						...getDealerScopeFilter(activeDealerId),
					},
					select: { name: true, phone: true, externalId: true },
				});
				if (!collectorEmployee) {
					throw new ORPCError("NOT_FOUND", {
						message: "Collector employee not found or inactive",
					});
				}
				updateData["collectorId"] = input.collectorId;
				updateData["collectorName"] = collectorEmployee.name;
				updateData["collectorPhone"] = collectorEmployee.phone ?? null;
			} else {
				updateData["collectorId"] = null;
				updateData["collectorName"] = null;
				updateData["collectorPhone"] = null;
			}
		}

		// Mirroring is unconditional: any change to a linked customer's
		// personal info is always pushed to iRadius (no opt-in flag). Gated
		// only by the org-level `iradiusDisabled` and whether the customer is
		// linked at all (`externalId`). `mirrorToIRadius` skips the remote step
		// entirely when `iradiusDisabled`, so we still gate `diff` on it to
		// avoid pointless work.
		const canMirror = !iradiusDisabled && !!existing.externalId;
		const statusChanged =
			input.status !== undefined && input.status !== existing.status;
		const diff = canMirror ? diffMirrorFields(existing, input) : null;

		const collectorIRadiusUserId =
			diff?.collectorChanged && collectorEmployee?.externalId
				? Number.parseInt(collectorEmployee.externalId, 10)
				: null;

		const customer = await mirrorToIRadius({
			iradiusDisabled,
			logTag: "iRadius customer update",
			failureMessage: "Failed to sync customer changes to iRadius",
			remote: async () => {
				if (statusChanged) {
					// Deactivating a customer already removed from iRadius is a
					// no-op, not a failure — don't fail the whole update over a
					// missing remote user. Activation still errors (can't
					// activate a user that no longer exists).
					await iradiusSetActive(
						existing,
						input.status === "ACTIVE",
						{
							tolerateMissing: input.status !== "ACTIVE",
						},
					);
				}
				if (!diff || !existing.externalId) {
					return;
				}
				await pushMirrorDiffToIRadius({
					externalId: existing.externalId,
					diff,
					next: input,
					existing,
					collectorIRadiusUserId,
				});
			},
			local: () =>
				db.customer.update({
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
				}),
		});

		const auditContext = getAuditContextFromHeaders(headers);
		customerAudit.updated(
			customer.id,
			user.id,
			input.organizationId,
			auditContext,
		);

		return { customer };
	});
