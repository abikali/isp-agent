import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { getUserEmployeeId } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { currentMonthRange } from "../lib/month-range";

/**
 * The customers the logged-in field employee actually worked on **this month** —
 * the ones he signed up (`NEW`) and the ones he visited or installed hardware
 * for (`SERVICE`). Backs the worker-portal "My customers this month" list.
 *
 * Deliberately activity-derived rather than `Customer.workerId`: the worker
 * portal is a "what did I do this month" view, so a subscriber he set up two
 * years ago and never touched again does not belong in it. It also removes the
 * old list's silent 100-row page cap, which would have truncated a long-serving
 * worker's list (and its money total) without any hint in the UI.
 *
 * Membership-scoped (same model as `myStats`) and strictly limited to the
 * caller's own employee record — field techs have no `customers view`.
 */

const CUSTOMER_CARD_SELECT = {
	id: true,
	accountNumber: true,
	firstName: true,
	lastName: true,
	groupName: true,
	mobile: true,
	status: true,
} as const;

interface CustomerCardRow {
	id: string;
	accountNumber: string;
	firstName: string | null;
	lastName: string | null;
	groupName: string | null;
	mobile: string | null;
	status: string;
}

interface MonthCustomer {
	id: string;
	accountNumber: string;
	name: string;
	groupName: string | null;
	mobile: string | null;
	status: string;
	/** NEW = he signed this customer up this month. SERVICE = existing customer. */
	kind: "NEW" | "SERVICE";
	/** Setup request still awaiting admin approval — the actionable state. */
	pendingApproval: boolean;
	/** Money he is on the hook to remit for this customer's work this month. */
	toCollect: number;
	/** Hardware he installed on this customer this month, merged by item name. */
	items: { name: string; quantity: number }[];
	/** Completed field visits (tasks) this month. */
	visits: number;
	lastActivityAt: Date;
}

function customerFields(customer: CustomerCardRow) {
	return {
		id: customer.id,
		accountNumber: customer.accountNumber,
		name:
			[customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
			customer.accountNumber,
		groupName: customer.groupName,
		mobile: customer.mobile,
		status: customer.status,
	};
}

function later(a: Date, b: Date | null | undefined): Date {
	return b && b > a ? b : a;
}

export const getMyMonthCustomers = protectedProcedure
	.route({
		method: "GET",
		path: "/employees/my-month-customers",
		tags: ["Employees"],
		summary:
			"Customers the current employee created or serviced this month",
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

		const org = input.organizationId;
		const monthRange = currentMonthRange();

		// Rejected requests are excluded: nothing was billed and no subscriber
		// exists, so they are not "new users" in any list, KPI or chart.
		const setups = await db.customerSetupRequest.findMany({
			where: {
				organizationId: org,
				requestedById: employeeId,
				createdAt: monthRange,
				status: { in: ["PENDING", "APPROVED"] },
			},
			select: {
				id: true,
				customerId: true,
				firstChargeAmount: true,
				status: true,
				createdAt: true,
				cashEntry: { select: { amount: true } },
				customer: { select: CUSTOMER_CARD_SELECT },
			},
			orderBy: { createdAt: "desc" },
			take: 200,
		});
		const setupIds = setups.map((setup) => setup.id);

		const [installs, visits] = await Promise.all([
			// Setup-bundle installs are pulled in by id as well as by date: a
			// request created on the last day of the month can have its bundle
			// installed on the first of the next one, and the new-customer card
			// must still show (and charge for) its own hardware.
			db.installation.findMany({
				where: {
					organizationId: org,
					employeeId,
					status: { not: "DENIED" },
					customerId: { not: null },
					OR: [
						{ installedAt: monthRange },
						...(setupIds.length > 0
							? [{ setupRequestId: { in: setupIds } }]
							: []),
					],
				},
				select: {
					customerId: true,
					quantity: true,
					price: true,
					isAddOn: true,
					setupRequestId: true,
					installedAt: true,
					stockItem: { select: { name: true } },
					customer: { select: CUSTOMER_CARD_SELECT },
				},
				orderBy: { installedAt: "desc" },
				take: 500,
			}),
			db.task.findMany({
				where: {
					organizationId: org,
					status: "COMPLETED",
					completedAt: monthRange,
					customerId: { not: null },
					assignments: { some: { employeeId } },
				},
				select: {
					completedAt: true,
					customerId: true,
					customer: { select: CUSTOMER_CARD_SELECT },
				},
				orderBy: { completedAt: "desc" },
				take: 300,
			}),
		]);

		interface Equipment {
			items: Map<string, number>;
			total: number;
			/** Portion belonging to a setup bundle — billed via the setup ledger. */
			bundle: number;
			lastAt: Date;
		}
		const equipment = new Map<string, Equipment>();
		for (const install of installs) {
			if (!install.customerId) {
				continue;
			}
			const entry = equipment.get(install.customerId) ?? {
				items: new Map<string, number>(),
				total: 0,
				bundle: 0,
				lastAt: install.installedAt,
			};
			const value = install.price * install.quantity;
			entry.total += value;
			if (install.setupRequestId) {
				entry.bundle += value;
			}
			const name =
				install.stockItem?.name ??
				(install.isAddOn ? "Add-on" : "Item");
			entry.items.set(
				name,
				(entry.items.get(name) ?? 0) + install.quantity,
			);
			entry.lastAt = later(entry.lastAt, install.installedAt);
			equipment.set(install.customerId, entry);
		}

		function itemsOf(customerId: string) {
			const entry = equipment.get(customerId);
			return entry
				? [...entry.items].map(([name, quantity]) => ({
						name,
						quantity,
					}))
				: [];
		}

		const cards = new Map<string, MonthCustomer>();

		// 1. New sign-ups — the frozen setup numbers, never the live monthlyRate
		// (admins and the iRadius sync can reprice a plan after the request was
		// priced, but the worker is only ever accountable for what was billed).
		for (const setup of setups) {
			const entry = equipment.get(setup.customerId);
			const equipmentTotal = entry?.total ?? 0;
			const laterEquipment = equipmentTotal - (entry?.bundle ?? 0);
			// The NEW_USER_SETUP ledger row is the exact amount billed to him at
			// approval (hardware + subscription cash); before approval we fall
			// back to the frozen prorated charge plus the bundle.
			const collected = setup.cashEntry
				? Math.abs(setup.cashEntry.amount)
				: null;
			cards.set(setup.customerId, {
				...customerFields(setup.customer),
				kind: "NEW",
				pendingApproval: setup.status === "PENDING",
				toCollect:
					collected != null
						? collected + laterEquipment
						: setup.firstChargeAmount + equipmentTotal,
				items: itemsOf(setup.customerId),
				visits: 0,
				lastActivityAt: later(setup.createdAt, entry?.lastAt),
			});
		}

		// 2. Existing customers he installed hardware for. Bundle installs are
		// left out of `toCollect`: that money sits in the setup ledger of the
		// month the request was raised, so counting it again here would bill him
		// twice across a month boundary.
		for (const install of installs) {
			const customer = install.customer;
			if (
				!install.customerId ||
				!customer ||
				cards.has(install.customerId)
			) {
				continue;
			}
			const entry = equipment.get(install.customerId);
			cards.set(install.customerId, {
				...customerFields(customer),
				kind: "SERVICE",
				pendingApproval: false,
				toCollect: (entry?.total ?? 0) - (entry?.bundle ?? 0),
				items: itemsOf(install.customerId),
				visits: 0,
				lastActivityAt: entry?.lastAt ?? install.installedAt,
			});
		}

		// 3. Completed field visits — a maintenance call that used no hardware
		// still counts as customer work he did this month.
		for (const visit of visits) {
			const customer = visit.customer;
			if (!visit.customerId || !customer) {
				continue;
			}
			const existing = cards.get(visit.customerId);
			if (existing) {
				existing.visits += 1;
				existing.lastActivityAt = later(
					existing.lastActivityAt,
					visit.completedAt,
				);
				continue;
			}
			cards.set(visit.customerId, {
				...customerFields(customer),
				kind: "SERVICE",
				pendingApproval: false,
				toCollect: 0,
				items: [],
				visits: 1,
				lastActivityAt: visit.completedAt ?? monthRange.gte,
			});
		}

		// New sign-ups first (they carry the money), pending approval at the very
		// top since those are the ones still needing something to happen.
		const customers = [...cards.values()].sort((a, b) => {
			if (a.kind !== b.kind) {
				return a.kind === "NEW" ? -1 : 1;
			}
			if (a.pendingApproval !== b.pendingApproval) {
				return a.pendingApproval ? -1 : 1;
			}
			return b.lastActivityAt.getTime() - a.lastActivityAt.getTime();
		});

		function totalFor(kind: "NEW" | "SERVICE") {
			return customers
				.filter((customer) => customer.kind === kind)
				.reduce((sum, customer) => sum + customer.toCollect, 0);
		}

		return {
			customers,
			newCount: customers.filter((c) => c.kind === "NEW").length,
			serviceCount: customers.filter((c) => c.kind === "SERVICE").length,
			newTotal: totalFor("NEW"),
			serviceTotal: totalFor("SERVICE"),
			totalToCollect: customers.reduce((sum, c) => sum + c.toCollect, 0),
		};
	});
