import { ORPCError } from "@orpc/server";
import {
	hasActionInRole,
	requirePermission,
	verifyCustomerOwnership,
} from "@repo/api/lib/permission";
import {
	customerAudit,
	getAuditContextFromHeaders,
} from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { iradiusSetActive } from "../../customers/lib/iradius-api";
import { mirrorToIRadius } from "../../customers/lib/iradius-mirror";
import { bustExpenseStats } from "../../expenses/lib/stats-cache";
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
			// New-user-setup rows: the subscriber the setup created stays live
			// unless the admin says otherwise in the confirm dialog. Opt-in, so
			// an admin who only wants the money and stock back keeps him online.
			deactivateCustomer: z.boolean().default(false),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { permCtx, activeDealerId, iradiusDisabled } =
			await requirePermission(
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
				setupRequest: {
					select: {
						customer: {
							select: {
								id: true,
								externalId: true,
								status: true,
								collectorId: true,
							},
						},
					},
				},
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

		// Already-inactive customers need neither the remote call nor the local
		// write — the same no-op skip bulkSetCustomerStatus does.
		const setupCustomer = collection.setupRequest?.customer;
		const customerToDeactivate =
			input.deactivateCustomer && setupCustomer?.status !== "INACTIVE"
				? (setupCustomer ?? null)
				: null;

		// Cutting a subscriber off is a customer-module action, not a billing
		// one; billing:manage alone must not grant it, and a delete:own scope
		// only reaches the caller's own subscribers — same gate as customers.delete.
		if (customerToDeactivate) {
			if (!hasActionInRole(permCtx, "customers", "delete")) {
				throw new ORPCError("FORBIDDEN", {
					message: "You can't deactivate customers",
				});
			}
			await verifyCustomerOwnership(
				permCtx,
				"delete",
				customerToDeactivate.collectorId,
			);
		}

		const runDelete = () =>
			db.$transaction(async (tx) => {
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
				// the hardware lines go back to pending.
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
				// The subscriber goes offline only when the admin asked for it in
				// the confirm dialog. iRadius has already been flipped at this
				// point (mirrorToIRadius runs the remote step first), so a failure
				// there aborts the whole revert instead of half-applying it.
				if (customerToDeactivate) {
					await tx.customer.update({
						where: { id: customerToDeactivate.id },
						data: { status: "INACTIVE" },
					});
				}
			});

		if (customerToDeactivate) {
			await mirrorToIRadius({
				iradiusDisabled,
				logTag: "iRadius deactivate (setup revert)",
				failureMessage:
					"Failed to deactivate the customer in iRadius — nothing was reverted",
				// Already gone from iRadius? Nothing to deactivate remotely; the
				// local INACTIVE can't drift from a user that isn't there.
				remote: () =>
					iradiusSetActive(customerToDeactivate, false, {
						tolerateMissing: true,
					}),
				local: runDelete,
			});
			customerAudit.deleted(
				customerToDeactivate.id,
				user.id,
				input.organizationId,
				getAuditContextFromHeaders(headers),
			);
		} else {
			await runDelete();
		}

		if (collection.expenseId) {
			bustExpenseStats();
		}

		return {
			success: true,
			installationsReverted:
				collection.installationId !== null ||
				collection.setupRequestId !== null,
			customerDeactivated: customerToDeactivate !== null,
		};
	});
