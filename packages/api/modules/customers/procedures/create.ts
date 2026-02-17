import { ORPCError } from "@orpc/server";
import { checkOrganizationAdmin } from "@repo/api/lib/membership";
import {
	customerAudit,
	getAuditContextFromHeaders,
} from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { generateAccountNumber } from "../lib/account-number";

export const createCustomer = protectedProcedure
	.route({
		method: "POST",
		path: "/customers",
		tags: ["Customers"],
		summary: "Create a new customer",
	})
	.input(
		z.object({
			organizationId: z.string(),
			fullName: z.string().min(1).max(200),
			email: z.string().email().optional(),
			phone: z.string().max(50).optional(),
			address: z.string().max(500).optional(),
			username: z.string().max(100).optional(),
			planId: z.string().optional(),
			stationId: z.string().optional(),
			status: z
				.enum(["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING"])
				.default("ACTIVE"),
			connectionType: z
				.enum(["FIBER", "WIRELESS", "DSL", "CABLE", "ETHERNET"])
				.optional(),
			ipAddress: z.string().max(45).optional(),
			macAddress: z.string().max(17).optional(),
			monthlyRate: z.number().min(0).optional(),
			billingDay: z.number().int().min(1).max(28).optional(),
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
				message: "Only organization admins can create customers",
			});
		}

		const accountNumber = await generateAccountNumber(input.organizationId);

		const customer = await db.customer.create({
			data: {
				organizationId: input.organizationId,
				accountNumber,
				fullName: input.fullName,
				email: input.email ?? null,
				phone: input.phone ?? null,
				address: input.address ?? null,
				username: input.username ?? null,
				planId: input.planId ?? null,
				stationId: input.stationId ?? null,
				status: input.status,
				connectionType: input.connectionType ?? null,
				ipAddress: input.ipAddress ?? null,
				macAddress: input.macAddress ?? null,
				monthlyRate: input.monthlyRate ?? null,
				billingDay: input.billingDay ?? null,
				notes: input.notes ?? null,
			},
			select: {
				id: true,
				accountNumber: true,
				fullName: true,
				email: true,
				status: true,
				createdAt: true,
			},
		});

		const auditContext = getAuditContextFromHeaders(headers);
		customerAudit.created(
			customer.id,
			user.id,
			input.organizationId,
			auditContext,
			{ fullName: input.fullName, accountNumber },
		);

		return { customer };
	});
