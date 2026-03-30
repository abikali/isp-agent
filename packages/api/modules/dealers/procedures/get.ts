import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import z from "zod";
import { adminProcedure } from "../../../orpc/procedures";

export const getDealer = adminProcedure
	.route({
		method: "GET",
		path: "/admin/dealers/{id}",
		tags: ["Dealers"],
		summary: "Get a single dealer (admin only)",
	})
	.input(
		z.object({
			id: z.string(),
		}),
	)
	.handler(async ({ input }) => {
		const dealer = await db.ispDealer.findFirst({
			where: {
				id: input.id,
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
