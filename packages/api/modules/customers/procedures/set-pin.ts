import { randomBytes } from "node:crypto";
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

export const setCustomerPin = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/{id}/pin",
		tags: ["Customers"],
		summary: "Set a customer's 6-digit PIN",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerId: z.string(),
			pin: z.string().regex(/^\d{6}$/, "PIN must be exactly 6 digits"),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const member = await checkOrganizationAdmin(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only organization admins can set customer PINs",
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

		const salt = randomBytes(16).toString("hex");
		const pinHash = await hashPin(input.pin, salt);

		await db.customer.update({
			where: { id: input.customerId },
			data: { pin: input.pin, pinHash },
		});

		const auditContext = getAuditContextFromHeaders(headers);
		customerAudit.pinUpdated(
			input.customerId,
			user.id,
			input.organizationId,
			auditContext,
		);

		return { success: true };
	});
