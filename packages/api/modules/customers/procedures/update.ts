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
import {
	iradiusChangeCollector,
	iradiusSetActive,
	iradiusUpdateUserAddress,
	iradiusUpdateUserComment,
	iradiusUpdateUserEmail,
	iradiusUpdateUserGroup,
	iradiusUpdateUserLocation,
	iradiusUpdateUserName,
	iradiusUpdateUserPhones,
} from "../lib/iradius-api";
import { mirrorToIRadius } from "../lib/iradius-mirror";
import { diffMirrorFields } from "../lib/mirror-fields";

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
			syncToIRadius: z.boolean().optional(),
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

		const syncEnabled =
			input.syncToIRadius === true && !!existing.externalId;
		const statusChanged =
			input.status !== undefined && input.status !== existing.status;
		const diff = syncEnabled ? diffMirrorFields(existing, input) : null;

		let collectorIRadiusUserId: number | null = null;
		if (diff?.collectorChanged && input.collectorId) {
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

		const customer = await mirrorToIRadius({
			logTag: "iRadius customer update",
			failureMessage: "Failed to sync customer changes to iRadius",
			remote: async () => {
				if (statusChanged) {
					await iradiusSetActive(existing, input.status === "ACTIVE");
				}
				if (!diff) {
					return;
				}
				if (diff.collectorChanged) {
					await iradiusChangeCollector(
						{ externalId: existing.externalId },
						collectorIRadiusUserId,
					);
				}
				if (diff.nameChanged) {
					const firstName =
						input.firstName ?? existing.firstName ?? "";
					const lastName =
						input.lastName !== undefined
							? (input.lastName ?? "")
							: (existing.lastName ?? "");
					await iradiusUpdateUserName(
						{ externalId: existing.externalId },
						firstName,
						lastName,
					);
				}
				if (diff.emailChanged) {
					await iradiusUpdateUserEmail(
						{ externalId: existing.externalId },
						input.email || null,
					);
				}
				if (diff.addressChanged) {
					await iradiusUpdateUserAddress(
						{ externalId: existing.externalId },
						input.address || null,
					);
				}
				if (diff.phonesChanged) {
					await iradiusUpdateUserPhones(
						{ externalId: existing.externalId },
						diff.submittedMobile,
					);
				}
				if (diff.groupChanged) {
					await iradiusUpdateUserGroup(
						{ externalId: existing.externalId },
						input.groupExternalId ?? null,
					);
				}
				if (diff.locationChanged) {
					await iradiusUpdateUserLocation(
						{ externalId: existing.externalId },
						input.latitude ?? null,
						input.longitude ?? null,
					);
				}
				if (diff.notesChanged) {
					await iradiusUpdateUserComment(
						{ externalId: existing.externalId },
						input.notes || null,
					);
				}
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
