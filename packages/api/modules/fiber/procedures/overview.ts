import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	FIBER_STAGES,
	type FiberAreaStatus,
	type FiberStage,
	OPEN_FIBER_STAGES,
} from "../lib/constants";
import {
	activeCustomerWhere,
	isAtRisk,
	leadScopeWhere,
	loadAreaStatuses,
	scoreActiveCustomers,
} from "../lib/queries";

const WEEKS = 8;
const DAY = 86_400_000;

/** Monday 00:00 UTC of the week containing `d`. */
function weekStart(d: Date): number {
	const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
	const dow = (new Date(t).getUTCDay() + 6) % 7;
	return t - dow * DAY;
}

export const fiberOverview = protectedProcedure
	.route({
		method: "GET",
		path: "/fiber/overview",
		tags: ["Fiber"],
		summary: "Fiber control room headline numbers, funnel and areas",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"marketing",
			"read",
		);
		const now = new Date();
		const since30 = new Date(now.getTime() - 30 * DAY);
		const since7 = new Date(now.getTime() - 7 * DAY);
		const firstWeek = weekStart(
			new Date(now.getTime() - (WEEKS - 1) * 7 * DAY),
		);
		const leadWhere = leadScopeWhere(input.organizationId, activeDealerId);
		const customerWhere = activeCustomerWhere(
			input.organizationId,
			activeDealerId,
		);

		const [
			scored,
			activeCustomers,
			landlineAsked,
			landlineYes,
			onFiber,
			leads,
			areaStatuses,
		] = await Promise.all([
			scoreActiveCustomers(input.organizationId, activeDealerId),
			db.customer.count({ where: customerWhere as never }),
			db.customer.count({
				where: {
					...customerWhere,
					hasLandline: { not: null },
				} as never,
			}),
			db.customer.count({
				where: { ...customerWhere, hasLandline: true } as never,
			}),
			db.customer.count({
				where: { ...customerWhere, plan: { isFiber: true } } as never,
			}),
			db.fiberLead.findMany({
				where: leadWhere as never,
				select: {
					stage: true,
					source: true,
					area: true,
					lostReason: true,
					assigneeId: true,
					nextActionAt: true,
					createdAt: true,
					wonAt: true,
					lostAt: true,
				},
			}),
			loadAreaStatuses(input.organizationId),
		]);

		const byStage = Object.fromEntries(
			FIBER_STAGES.map((s) => [s, 0]),
		) as Record<FiberStage, number>;
		let overdue = 0;
		let unassigned = 0;
		let newThisWeek = 0;
		let won30 = 0;
		let lostToOgero30 = 0;
		let lostToOgero = 0;
		const lostReasons: Record<string, number> = {};
		const weekly = new Map<number, Record<string, number>>();
		for (let i = 0; i < WEEKS; i++) {
			weekly.set(firstWeek + i * 7 * DAY, {});
		}

		const open = new Set<string>(OPEN_FIBER_STAGES);
		for (const l of leads) {
			const stage = l.stage as FiberStage;
			byStage[stage] = (byStage[stage] ?? 0) + 1;
			if (open.has(l.stage)) {
				if (l.nextActionAt && l.nextActionAt < now) {
					overdue += 1;
				}
				if (!l.assigneeId) {
					unassigned += 1;
				}
			}
			if (l.createdAt >= since7) {
				newThisWeek += 1;
			}
			if (l.stage === "WON" && l.wonAt && l.wonAt >= since30) {
				won30 += 1;
			}
			if (l.stage === "LOST") {
				const reason = l.lostReason ?? "OTHER";
				lostReasons[reason] = (lostReasons[reason] ?? 0) + 1;
				if (reason === "OGERO") {
					lostToOgero += 1;
					if (l.lostAt && l.lostAt >= since30) {
						lostToOgero30 += 1;
					}
				}
			}
			const bucket = weekly.get(weekStart(l.createdAt));
			if (bucket) {
				bucket[l.source] = (bucket[l.source] ?? 0) + 1;
			}
		}

		// Area battle table: customers we hold vs leads we're working, per area.
		interface AreaRow {
			area: string;
			status: FiberAreaStatus;
			customers: number;
			landline: number;
			atRisk: number;
			openLeads: number;
			won: number;
			lostToOgero: number;
			/** Raw group names folded into this area (for broadcast audiences). */
			groupNames: string[];
		}
		const areas = new Map<string, AreaRow>();
		const row = (area: string): AreaRow => {
			let r = areas.get(area);
			if (!r) {
				r = {
					area,
					status: areaStatuses.get(area) ?? "NONE",
					customers: 0,
					landline: 0,
					atRisk: 0,
					openLeads: 0,
					won: 0,
					lostToOgero: 0,
					groupNames: [],
				};
				areas.set(area, r);
			}
			return r;
		};
		for (const c of scored) {
			if (!c.area) {
				continue;
			}
			const r = row(c.area);
			r.customers += 1;
			if (c.groupName && !r.groupNames.includes(c.groupName)) {
				r.groupNames.push(c.groupName);
			}
			r.landline += c.reasons.includes("HAS_LANDLINE") ? 1 : 0;
			r.atRisk += isAtRisk(c) ? 1 : 0;
		}
		for (const l of leads) {
			if (!l.area) {
				continue;
			}
			const r = row(l.area);
			if (open.has(l.stage)) {
				r.openLeads += 1;
			} else if (l.stage === "WON") {
				r.won += 1;
			} else if (l.lostReason === "OGERO") {
				r.lostToOgero += 1;
			}
		}
		// Areas Jhonny marked keep showing even before any customer is there.
		for (const [area] of areaStatuses) {
			row(area);
		}
		const statusRank: Record<FiberAreaStatus, number> = {
			LIVE: 0,
			ROLLOUT: 1,
			NONE: 2,
		};
		const areaRows = [...areas.values()].sort(
			(a, b) =>
				statusRank[a.status] - statusRank[b.status] ||
				b.atRisk - a.atRisk ||
				b.customers - a.customers,
		);

		const atRisk = scored.filter(isAtRisk);
		return {
			kpis: {
				openLeads: OPEN_FIBER_STAGES.reduce(
					(s, st) => s + byStage[st],
					0,
				),
				newThisWeek,
				overdue,
				unassigned,
				won: byStage.WON,
				won30,
				lostToOgero,
				lostToOgero30,
				atRisk: atRisk.length,
				atRiskNotInPipeline: atRisk.filter((c) => !c.lead).length,
				activeCustomers,
				landlineAsked,
				landlineYes,
				/** Active customers on a plan flagged as fiber. */
				onFiber,
			},
			byStage,
			lostReasons,
			weekly: [...weekly.entries()].map(([start, sources]) => ({
				weekStart: new Date(start).toISOString(),
				...sources,
			})),
			areas: areaRows,
		};
	});
