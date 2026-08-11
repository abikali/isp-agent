import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { getUserEmployeeId } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Items the logged-in field employee has installed, grouped by customer.
 * Backs the "items installed" rows in the worker-portal "My customers" list.
 * Membership-scoped (same model as `myStats`); merges repeated items per
 * customer and skips denied installs.
 *
 * Also returns the worker's own setup requests (`setupByCustomer`) so the
 * portal can show what was actually billed for a new customer — the frozen
 * `firstChargeAmount` and, post-approval, the NEW_USER_SETUP ledger amount —
 * instead of the live `customer.monthlyRate`, which admins/syncs can change
 * after the request was priced.
 */
export const getMyCustomerItems = protectedProcedure
	.route({
		method: "GET",
		path: "/employees/my-customer-items",
		tags: ["Employees"],
		summary: "Installed items grouped by customer for the current employee",
	})
	.input(z.object({ organizationId: z.string() }))
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

		const employeeId = await getUserEmployeeId(
			input.organizationId,
			user.id,
		);
		if (!employeeId) {
			throw new ORPCError("FORBIDDEN", {
				message: "No employee record linked to your account",
			});
		}

		const rows = await db.installation.findMany({
			where: {
				organizationId: input.organizationId,
				employeeId,
				status: { not: "DENIED" },
				customerId: { not: null },
			},
			select: {
				customerId: true,
				quantity: true,
				price: true,
				isAddOn: true,
				setupRequestId: true,
				stockItem: { select: { name: true } },
			},
			orderBy: { installedAt: "desc" },
			take: 2000,
		});

		interface CustomerItems {
			items: { name: string; quantity: number }[];
			equipmentTotal: number;
			// Portion of equipmentTotal belonging to the new-customer setup
			// bundle — its money lives in the NEW_USER_SETUP ledger entry,
			// unlike later installs which are billed separately.
			bundleTotal: number;
		}
		const byCustomer: Record<string, CustomerItems> = {};
		for (const row of rows) {
			if (!row.customerId) {
				continue;
			}
			const name =
				row.stockItem?.name ?? (row.isAddOn ? "Add-on" : "Item");
			const entry = byCustomer[row.customerId] ?? {
				items: [],
				equipmentTotal: 0,
				bundleTotal: 0,
			};
			entry.equipmentTotal += row.price * row.quantity;
			if (row.setupRequestId) {
				entry.bundleTotal += row.price * row.quantity;
			}
			const existing = entry.items.find((item) => item.name === name);
			if (existing) {
				existing.quantity += row.quantity;
			} else {
				entry.items.push({ name, quantity: row.quantity });
			}
			byCustomer[row.customerId] = entry;
		}

		// Rejected requests are excluded: nothing was billed, so the portal
		// falls back to the plain monthlyRate + equipment view.
		const setups = await db.customerSetupRequest.findMany({
			where: {
				organizationId: input.organizationId,
				requestedById: employeeId,
				status: { in: ["PENDING", "APPROVED"] },
			},
			select: {
				customerId: true,
				firstChargeAmount: true,
				cashEntry: { select: { amount: true } },
			},
		});
		const setupByCustomer: Record<
			string,
			{ firstChargeAmount: number; collectedAmount: number | null }
		> = {};
		for (const setup of setups) {
			setupByCustomer[setup.customerId] = {
				firstChargeAmount: setup.firstChargeAmount,
				// The NEW_USER_SETUP ledger row is the exact amount billed to
				// the worker at approval (hardware + subscription cash he took).
				collectedAmount: setup.cashEntry
					? Math.abs(setup.cashEntry.amount)
					: null,
			};
		}

		return { byCustomer, setupByCustomer };
	});
