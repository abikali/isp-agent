import { requirePermission } from "@repo/api/lib/permission";
import {
	customerAudit,
	getAuditContextFromHeaders,
} from "@repo/auth/lib/audit";
import { db, getPrimaryPhone, MAX_PHONES } from "@repo/database";
import { createAccountNumberGenerator } from "@repo/jobs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

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
			firstName: z.string().min(1).max(100),
			lastName: z.string().max(100).optional(),
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
			username: z.string().max(100).optional(),
			planId: z.string().optional(),
			stationId: z.string().optional(),
			status: z
				.enum(["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING"])
				.default("ACTIVE"),
			connectionType: z
				.enum(["FIBER", "WIRELESS", "DSL", "CABLE", "ETHERNET"])
				.optional(),
			monthlyRate: z.number().min(0).optional(),
			billingDay: z.number().int().min(1).max(28).optional(),
			groupName: z.string().max(100).optional(),
			notes: z.string().max(5000).optional(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"create",
		);

		const nextAccountNumber = await createAccountNumberGenerator(
			input.organizationId,
		);
		const accountNumber = nextAccountNumber();

		const customer = await db.customer.create({
			data: {
				organizationId: input.organizationId,
				accountNumber,
				firstName: input.firstName,
				lastName: input.lastName ?? null,
				dealerId: activeDealerId ?? null,
				fullName: [input.firstName, input.lastName]
					.filter(Boolean)
					.join(" "),
				email: input.email ?? null,
				phones: input.phones ?? [],
				mobile: input.phones ? getPrimaryPhone(input.phones) : null,
				address: input.address ?? null,
				username: input.username ?? null,
				planId: input.planId ?? null,
				stationId: input.stationId ?? null,
				status: input.status,
				connectionType: input.connectionType ?? null,
				monthlyRate: input.monthlyRate ?? null,
				billingDay: input.billingDay ?? null,
				groupName: input.groupName ?? null,
				notes: input.notes ?? null,
			},
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
		customerAudit.created(
			customer.id,
			user.id,
			input.organizationId,
			auditContext,
			{
				fullName: [input.firstName, input.lastName]
					.filter(Boolean)
					.join(" "),
				accountNumber,
			},
		);

		return { customer };
	});
