import { randomBytes, randomInt } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { hashPin } from "@repo/ai";
import { checkOrganizationAdmin } from "@repo/api/lib/membership";
import {
	customerAudit,
	getAuditContextFromHeaders,
} from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const generateCustomerPin = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/{id}/pin/generate",
		tags: ["Customers"],
		summary: "Generate a random 6-digit PIN for a customer",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerId: z.string(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const member = await checkOrganizationAdmin(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only organization admins can generate customer PINs",
			});
		}

		const customer = await db.customer.findFirst({
			where: {
				id: input.customerId,
				organizationId: input.organizationId,
			},
			select: { id: true },
		});

		if (!customer) {
			throw new ORPCError("NOT_FOUND", {
				message: "Customer not found",
			});
		}

		// Generate cryptographically secure 6-digit PIN
		const pin = randomInt(100000, 999999).toString();

		const salt = randomBytes(16).toString("hex");
		const pinHash = await hashPin(pin, salt);

		await db.customer.update({
			where: { id: input.customerId },
			data: { pin, pinHash },
		});

		const auditContext = getAuditContextFromHeaders(headers);
		customerAudit.pinGenerated(
			input.customerId,
			user.id,
			input.organizationId,
			auditContext,
		);

		return { pin };
	});
