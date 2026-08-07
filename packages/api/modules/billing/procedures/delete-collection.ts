import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { revertApprovedInstallation } from "../../installations/procedures/review";

export const deleteCollection = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/collections/delete",
		tags: ["Billing"],
		summary: "Delete a cash collection record",
	})
	.input(
		z.object({
			organizationId: z.string(),
			collectionId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const collection = await db.cashCollection.findFirst({
			where: {
				id: input.collectionId,
				organizationId: input.organizationId,
				collector: { dealerId: activeDealerId ?? null },
			},
			select: {
				id: true,
				externalBillingId: true,
				expenseId: true,
				installationId: true,
				setupRequestId: true,
			},
		});

		if (!collection) {
			throw new ORPCError("NOT_FOUND", {
				message: "Collection record not found",
			});
		}

		// Rows imported from the legacy billing system are read-only here —
		// deleting them locally is futile (they re-sync on the next import).
		if (collection.externalBillingId !== null) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"This entry is synced from the billing system and can't be deleted here.",
			});
		}

		await db.$transaction(async (tx) => {
			await tx.cashCollection.delete({
				where: { id: collection.id },
			});
			// Money-given / approved-expense rows own a linked expense; remove it
			// too so the entry stops counting in the accounting reports + metric.
			if (collection.expenseId) {
				await tx.expense.deleteMany({
					where: {
						id: collection.expenseId,
						externalBillingId: null,
					},
				});
			}
			// Installation-cost rows revert the approval they came from: the
			// worker gets the consumed stock back and the installation returns
			// to the pending queue for re-review. Without this, deleting the
			// entry removed the money but left the stock consumed.
			if (collection.installationId) {
				await revertApprovedInstallation(
					tx,
					collection.installationId,
					user.id,
				);
			}
			// New-user-setup rows revert every installation in the bundle the
			// same way. The customer/setup request itself stays approved — only
			// the hardware lines go back to pending with their stock restored.
			if (collection.setupRequestId) {
				const bundleInstallations = await tx.installation.findMany({
					where: {
						setupRequestId: collection.setupRequestId,
						status: "APPROVED",
					},
					select: { id: true },
				});
				for (const inst of bundleInstallations) {
					await revertApprovedInstallation(tx, inst.id, user.id);
				}
			}
		});

		return { success: true };
	});
