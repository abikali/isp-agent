import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import z from "zod";
import { adminProcedure } from "../../../orpc/procedures";

/**
 * Mark an iRadius dealer account as one of an organization's own product
 * lines (LIBANCOM-FIBER for abiroot) instead of a reseller. The org sync then
 * imports its subscribers, staff and plans as the org's own, under the
 * master dealer. `organizationId: null` unlinks it.
 */
export const setInternalDealerLine = adminProcedure
	.route({
		method: "POST",
		path: "/admin/dealers/set-internal-line",
		tags: ["Dealers"],
		summary:
			"Link a dealer as an internal line of an organization (admin only, null unlinks)",
	})
	.input(
		z.object({
			dealerId: z.string(),
			organizationId: z.string().nullable(),
		}),
	)
	.handler(async ({ input }) => {
		const dealer = await db.ispDealer.findFirst({
			where: { id: input.dealerId },
			select: {
				id: true,
				externalId: true,
				activeForOrganization: { select: { id: true } },
			},
		});
		if (!dealer) {
			throw new ORPCError("NOT_FOUND", { message: "Dealer not found" });
		}

		if (input.organizationId) {
			const organization = await db.organization.findUnique({
				where: { id: input.organizationId },
				select: { activeDealerId: true },
			});
			if (!organization) {
				throw new ORPCError("NOT_FOUND", {
					message: "Organization not found",
				});
			}
			// Lines resolve onto the master during sync; without one there
			// is nothing to resolve them onto.
			if (!organization.activeDealerId) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Assign the organization's dealer first",
				});
			}
			if (dealer.activeForOrganization) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"This dealer is an organization's own dealer and cannot also be a line",
				});
			}
			if (!dealer.externalId) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Only dealers synced from iRadius can be lines",
				});
			}
		}

		await db.ispDealer.update({
			where: { id: dealer.id },
			data: { internalLineOfOrganizationId: input.organizationId },
		});

		return { success: true, organizationId: input.organizationId };
	});
