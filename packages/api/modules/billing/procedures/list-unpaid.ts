import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import {
	getActionScope,
	getPermissionContext,
	verifyPermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listUnpaidCustomers = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/unpaid",
		tags: ["Billing"],
		summary: "List unpaid customers, optionally filtered by collector",
	})
	.input(
		z.object({
			organizationId: z.string(),
			collectorId: z.string().optional(),
			groupName: z.string().optional(),
			search: z.string().optional(),
			expiryFrom: z.string().optional(),
			expiryTo: z.string().optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(10).max(100).default(25),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const member = await verifyOrganizationMembership(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		const permCtx = getPermissionContext(
			user.id,
			input.organizationId,
			member.role,
			member.rolePermissions,
		);
		verifyPermission(permCtx, "billing", "collect");

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
			paidCurrentCycle: false,
			status: "ACTIVE",
		};

		// If scope is "own", auto-filter to this collector's customers
		const scope = getActionScope(permCtx, "billing", "collect");
		if (scope === "own") {
			const emp = await db.employee.findFirst({
				where: {
					organizationId: input.organizationId,
					userId: user.id,
				},
				select: { id: true },
			});
			if (emp) {
				where["collectorId"] = emp.id;
			}
		} else if (input.collectorId) {
			where["collectorId"] = input.collectorId;
		}
		if (input.groupName) {
			where["groupName"] = input.groupName;
		}
		if (input.search) {
			where["OR"] = [
				{ firstName: { contains: input.search, mode: "insensitive" } },
				{ lastName: { contains: input.search, mode: "insensitive" } },
				{ username: { contains: input.search, mode: "insensitive" } },
				{ mobile: { contains: input.search, mode: "insensitive" } },
			];
		}
		if (input.expiryFrom || input.expiryTo) {
			const expiresAt: Record<string, unknown> = {};
			if (input.expiryFrom) {
				expiresAt["gte"] = new Date(input.expiryFrom);
			}
			if (input.expiryTo) {
				expiresAt["lte"] = new Date(input.expiryTo);
			}
			where["expiresAt"] = expiresAt;
		}

		const [customers, total] = await Promise.all([
			db.customer.findMany({
				where,
				select: {
					id: true,
					accountNumber: true,
					firstName: true,
					lastName: true,
					username: true,
					mobile: true,
					phone: true,
					address: true,
					groupName: true,
					expiresAt: true,
					monthlyRate: true,
					discount: true,
					iptvPrice: true,
					realIpPrice: true,
					plan: {
						select: { id: true, name: true, monthlyPrice: true },
					},
					collector: { select: { id: true, name: true } },
					station: { select: { id: true, name: true } },
				},
				orderBy: { expiresAt: "asc" },
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
			}),
			db.customer.count({ where }),
		]);

		return {
			customers,
			total,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});
