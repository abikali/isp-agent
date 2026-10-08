import { getDealerScopeFilter } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { normalizeArea } from "@repo/utils";
import {
	FIBER_RISK_THRESHOLD,
	FIBER_RISK_WEIGHTS,
	type FiberAreaStatus,
	type FiberRiskReason,
} from "./constants";

/**
 * Leads the member may see: outside leads (no customer) are org-wide,
 * customer leads follow the customer's dealer scope like everything else.
 */
export function leadScopeWhere(
	organizationId: string,
	activeDealerId: string | null,
): Record<string, unknown> {
	return {
		organizationId,
		OR: [
			{ customerId: null },
			{ customer: getDealerScopeFilter(activeDealerId) },
		],
	};
}

export function activeCustomerWhere(
	organizationId: string,
	activeDealerId: string | null,
): Record<string, unknown> {
	return {
		organizationId,
		deletedAt: null,
		status: "ACTIVE",
		...getDealerScopeFilter(activeDealerId),
	};
}

export async function loadAreaStatuses(
	organizationId: string,
): Promise<Map<string, FiberAreaStatus>> {
	const rows = await db.fiberArea.findMany({
		where: { organizationId },
		select: { area: true, status: true },
	});
	return new Map(rows.map((r) => [r.area, r.status as FiberAreaStatus]));
}

interface AtRiskCustomer {
	id: string;
	name: string;
	username: string | null;
	area: string | null;
	/** Raw iRadius group name — what marketing audiences match on. */
	groupName: string | null;
	mobile: string | null;
	landline: string | null;
	monthlyRate: number | null;
	planName: string | null;
	reasons: FiberRiskReason[];
	score: number;
	lead: { id: string; stage: string } | null;
}

/**
 * Every active customer scored for fiber risk, highest first. Customers
 * already won to LibanCom fiber are left out. Reasons are kept so the page
 * can say *why*, not just how much.
 */
export async function scoreActiveCustomers(
	organizationId: string,
	activeDealerId: string | null,
): Promise<AtRiskCustomer[]> {
	const [customers, areas, leads] = await Promise.all([
		db.customer.findMany({
			where: activeCustomerWhere(organizationId, activeDealerId) as never,
			select: {
				id: true,
				firstName: true,
				lastName: true,
				username: true,
				groupName: true,
				mobile: true,
				landline: true,
				hasLandline: true,
				monthlyRate: true,
				plan: { select: { name: true, isFiber: true } },
			},
		}),
		loadAreaStatuses(organizationId),
		db.fiberLead.findMany({
			where: { organizationId, customerId: { not: null } },
			select: {
				id: true,
				customerId: true,
				stage: true,
				source: true,
				ogeroApproached: true,
			},
		}),
	]);
	const leadByCustomer = new Map(leads.map((l) => [l.customerId, l]));

	const scored: AtRiskCustomer[] = [];
	for (const c of customers) {
		const lead = leadByCustomer.get(c.id);
		// Already won, or already on a fiber plan: nothing left to defend.
		if (lead?.stage === "WON" || c.plan?.isFiber) {
			continue;
		}
		const area = normalizeArea(c.groupName);
		const reasons: FiberRiskReason[] = [];
		const areaStatus = area ? areas.get(area) : undefined;
		if (areaStatus === "ROLLOUT" || areaStatus === "LIVE") {
			reasons.push("FIBER_AREA");
		}
		if (lead?.ogeroApproached) {
			reasons.push("OGERO_APPROACHED");
		}
		// Only leads the customer started — a lead staff opened from this list
		// must not make the customer look riskier.
		if (
			lead &&
			lead.stage !== "LOST" &&
			CUSTOMER_SIGNAL_SOURCES.has(lead.source)
		) {
			reasons.push("ASKED_FIBER");
		}
		if (c.hasLandline) {
			reasons.push("HAS_LANDLINE");
		}
		const score = reasons.reduce((s, r) => s + FIBER_RISK_WEIGHTS[r], 0);
		scored.push({
			id: c.id,
			name: [c.firstName, c.lastName].filter(Boolean).join(" ") || "—",
			username: c.username,
			area,
			groupName: c.groupName,
			mobile: c.mobile,
			landline: c.landline,
			monthlyRate: c.monthlyRate,
			planName: c.plan?.name ?? null,
			reasons,
			score,
			lead: lead ? { id: lead.id, stage: lead.stage } : null,
		});
	}
	// Equal risk: the customer paying more is the bigger loss.
	return scored.sort(
		(a, b) =>
			b.score - a.score || (b.monthlyRate ?? 0) - (a.monthlyRate ?? 0),
	);
}

const CUSTOMER_SIGNAL_SOURCES = new Set([
	"BOT",
	"ESCALATION",
	"BROADCAST",
	"CHURN",
]);

export function isAtRisk(c: { score: number }): boolean {
	return c.score >= FIBER_RISK_THRESHOLD;
}
