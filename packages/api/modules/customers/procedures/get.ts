import { ORPCError } from "@orpc/server";
import {
	requirePermission,
	verifyCustomerOwnership,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getCustomer = protectedProcedure
	.route({
		method: "GET",
		path: "/customers/{id}",
		tags: ["Customers"],
		summary: "Get a single customer with plan and station details",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const [{ permCtx }, customer] = await Promise.all([
			requirePermission(
				input.organizationId,
				user.id,
				"customers",
				"read",
			),
			db.customer.findFirst({
				where: {
					id: input.id,
					organizationId: input.organizationId,
				},
				include: {
					plan: {
						select: {
							id: true,
							name: true,
							downloadSpeed: true,
							uploadSpeed: true,
							monthlyPrice: true,
						},
					},
					station: {
						select: {
							id: true,
							name: true,
							address: true,
							status: true,
						},
					},
					accessPoint: {
						select: {
							id: true,
							name: true,
							ipAddress: true,
							signal: true,
							boardName: true,
							online: true,
						},
					},
					dealer: { select: { id: true, name: true } },
					collector: {
						select: { id: true, name: true, phone: true },
					},
					nas: { select: { id: true, name: true } },
				},
			}),
		]);

		if (!customer) {
			throw new ORPCError("NOT_FOUND", {
				message: "Customer not found",
			});
		}

		await verifyCustomerOwnership(permCtx, "read", customer.collectorId);

		const { pinHash, ...customerData } = customer;

		return { customer: { ...customerData, hasPin: pinHash !== null } };
	});
