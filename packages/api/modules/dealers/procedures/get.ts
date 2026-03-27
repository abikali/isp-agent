import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getDealer = protectedProcedure
	.route({
		method: "GET",
		path: "/dealers/{id}",
		tags: ["Dealers"],
		summary: "Get a single dealer",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
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

		const dealer = await db.ispDealer.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
			},
			include: {
				parentDealer: { select: { id: true, name: true } },
				childDealers: { select: { id: true, name: true } },
				_count: { select: { customers: true, employees: true } },
				dealerAccounts: {
					take: 20,
					orderBy: { operationDate: "desc" },
				},
				servicePlans: {
					select: { id: true, name: true, monthlyPrice: true },
				},
			},
		});

		if (!dealer) {
			throw new ORPCError("NOT_FOUND", {
				message: "Dealer not found",
			});
		}

		return { dealer };
	});
