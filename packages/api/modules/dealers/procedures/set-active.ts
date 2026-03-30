import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import z from "zod";
import { adminProcedure } from "../../../orpc/procedures";

export const setActiveDealer = adminProcedure
	.route({
		method: "POST",
		path: "/admin/dealers/set-active",
		tags: ["Dealers"],
		summary:
			"Assign a dealer to an organization (admin only, null clears the assignment)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			dealerId: z.string().nullable(),
		}),
	)
	.handler(async ({ input }) => {
		if (input.dealerId) {
			// Verify dealer exists
			const dealer = await db.ispDealer.findFirst({
				where: { id: input.dealerId },
			});
			if (!dealer) {
				throw new ORPCError("NOT_FOUND", {
					message: "Dealer not found",
				});
			}

			// Assign dealer to this organization and set as active
			await db.$transaction([
				db.ispDealer.update({
					where: { id: input.dealerId },
					data: { organizationId: input.organizationId },
				}),
				db.organization.update({
					where: { id: input.organizationId },
					data: { activeDealerId: input.dealerId },
				}),
			]);
		} else {
			// Clear active dealer (don't unassign the dealer record itself)
			await db.organization.update({
				where: { id: input.organizationId },
				data: { activeDealerId: null },
			});
		}

		return { success: true, activeDealerId: input.dealerId };
	});
