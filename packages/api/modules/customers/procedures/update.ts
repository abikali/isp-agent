import { ORPCError } from "@orpc/server";
import { checkOrganizationAdmin } from "@repo/api/lib/membership";
import {
	customerAudit,
	getAuditContextFromHeaders,
} from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

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
			phone: z.string().max(50).optional(),
			address: z.string().max(500).optional(),
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
			notes: z.string().max(5000).optional(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const member = await checkOrganizationAdmin(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only organization admins can update customers",
			});
		}

		const existing = await db.customer.findFirst({
			where: { id: input.id, organizationId: input.organizationId },
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Customer not found",
			});
		}

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
		if (input.phone !== undefined) {
			updateData["phone"] = input.phone ?? null;
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

		const auditContext = getAuditContextFromHeaders(headers);
		customerAudit.updated(
			customer.id,
			user.id,
			input.organizationId,
			auditContext,
		);

		return { customer };
	});
