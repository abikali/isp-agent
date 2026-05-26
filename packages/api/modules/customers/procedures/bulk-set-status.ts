import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import {
	customerAudit,
	getAuditContextFromHeaders,
} from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { iradiusSetActive } from "../lib/iradius-api";

/**
 * Bulk-flip the `status` field of N customers between ACTIVE and INACTIVE.
 * This is the bulk-toolbar equivalent of the single-customer deactivate
 * (`delete`) and reactivate (form save) flows on the detail page.
 *
 * Pattern matches the rest of the customer module: mirror-first so iRadius
 * stays consistent with our DB. Each customer is processed sequentially —
 * the iRadius API can stall under parallel load, and a fan-out would
 * exhaust the SSH connection budget for marginal speedup at the sizes
 * (<=200) the UI allows. The result reports per-customer outcomes so
 * partial failures can be surfaced to the operator.
 *
 * Customers without an `externalId` (locally-created, never pushed) still
 * have their local status updated; iRadius is skipped for them.
 */
export const bulkSetCustomerStatus = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/bulk-set-status",
		tags: ["Customers"],
		summary:
			"Bulk activate or deactivate a set of customers in iRadius + local DB",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerIds: z.array(z.string()).min(1).max(200),
			status: z.enum(["ACTIVE", "INACTIVE"]),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { activeDealerId, iradiusDisabled } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"delete",
		);

		// Resolve only the customers the caller is allowed to touch. Anything
		// outside the dealer scope or wrong org is silently dropped — same
		// shape as `bulkRequestLocation`.
		const customers = await db.customer.findMany({
			where: {
				id: { in: input.customerIds },
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
			select: {
				id: true,
				externalId: true,
				status: true,
			},
		});

		if (customers.length === 0) {
			throw new ORPCError("NOT_FOUND", {
				message: "No accessible customers in this selection",
			});
		}

		const targetActive = input.status === "ACTIVE";
		const auditContext = getAuditContextFromHeaders(headers);
		let succeeded = 0;
		let skipped = 0;
		const failures: Array<{ id: string; reason: string }> = [];

		for (const customer of customers) {
			// Skip rows that already match the requested status — no-op work
			// and avoids spurious iRadius calls (the activate-user endpoint
			// is idempotent but every call costs a SSH round-trip).
			if (customer.status === input.status) {
				skipped++;
				continue;
			}

			try {
				if (!iradiusDisabled && customer.externalId) {
					// On deactivation, a customer already deleted in iRadius
					// should count as done (proceed to local INACTIVE), not as
					// a failure row. Activation still errors as usual.
					await iradiusSetActive(
						{ externalId: customer.externalId },
						targetActive,
						{ tolerateMissing: !targetActive },
					);
				}
				await db.customer.update({
					where: { id: customer.id },
					data: { status: input.status },
				});
				if (targetActive) {
					customerAudit.updated(
						customer.id,
						user.id,
						input.organizationId,
						auditContext,
					);
				} else {
					customerAudit.deleted(
						customer.id,
						user.id,
						input.organizationId,
						auditContext,
					);
				}
				succeeded++;
			} catch (error) {
				const reason =
					error instanceof Error ? error.message : "Unknown error";
				logger.error("[Customer bulk-set-status] Failed", {
					customerId: customer.id,
					targetStatus: input.status,
					reason,
				});
				failures.push({ id: customer.id, reason });
			}
		}

		return {
			succeeded,
			skipped,
			failed: failures.length,
			failures,
			requested: input.customerIds.length,
		};
	});
