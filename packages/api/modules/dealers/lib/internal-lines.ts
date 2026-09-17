import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";

/**
 * An organization's own iRadius dealer accounts: its master
 * (`Organization.activeDealerId`, johnnyh for abiroot) and its internal lines
 * (`IspDealer.internalLineOfOrganizationId`, LIBANCOM-FIBER).
 *
 * The org sync resolves everything under a line onto the master, so customers
 * and plans of both lines carry the master's `dealerId`. What still tells the
 * lines apart is the plan's `dealerExternalId` — the iRadius dealer that owns
 * the AccountType, and the one iRadius bills when a subscriber on it is
 * charged.
 */
export interface OrgDealerLines {
	master: { id: string; externalId: string | null } | null;
	lines: Array<{ id: string; externalId: string | null; name: string }>;
}

export type PlanLine =
	| { kind: "master" }
	| { kind: "line"; dealerId: string; externalId: string; name: string }
	| { kind: "foreign" };

interface PlanDealerFields {
	dealerId: string | null;
	dealerExternalId: string | null;
}

export async function loadOrgDealerLines(
	organizationId: string,
): Promise<OrgDealerLines> {
	const organization = await db.organization.findUnique({
		where: { id: organizationId },
		select: {
			activeDealer: { select: { id: true, externalId: true } },
			internalDealerLines: {
				select: { id: true, externalId: true, name: true },
			},
		},
	});
	return {
		master: organization?.activeDealer ?? null,
		lines: organization?.internalDealerLines ?? [],
	};
}

/**
 * Which of the org's own lines sells `plan`: the master, one of its internal
 * lines, or neither (another dealer's AccountType).
 */
export function resolvePlanLine(
	plan: PlanDealerFields,
	{ master, lines }: OrgDealerLines,
): PlanLine {
	const line = lines.find(
		(l) =>
			(plan.dealerExternalId !== null &&
				l.externalId === plan.dealerExternalId) ||
			// Not yet repointed at the master by a sync since the line was linked.
			l.id === plan.dealerId,
	);
	if (line?.externalId) {
		return {
			kind: "line",
			dealerId: line.id,
			externalId: line.externalId,
			name: line.name,
		};
	}
	if (
		plan.dealerId === (master?.id ?? null) ||
		(master?.externalId != null &&
			plan.dealerExternalId === master.externalId)
	) {
		return { kind: "master" };
	}
	return { kind: "foreign" };
}

function lineKey(line: PlanLine): string {
	return line.kind === "line" ? `line:${line.dealerId}` : line.kind;
}

/**
 * Refuse a plan move between the master and an internal line (or between two
 * lines). The subscriber's `User.ParentId` stays where it is on an account
 * type change, so iRadius would bill one line's credit for the other line's
 * plan — and moving a subscriber between dealers has no sanctioned write.
 *
 * A customer with no local plan is taken to be on the master line, where every
 * customer lands by default. Orgs without internal lines are never affected.
 */
export function assertSamePlanLine(
	currentPlan: PlanDealerFields | null,
	newPlan: PlanDealerFields,
	lines: OrgDealerLines,
): void {
	const from: PlanLine = currentPlan
		? resolvePlanLine(currentPlan, lines)
		: { kind: "master" };
	const to = resolvePlanLine(newPlan, lines);
	if (from.kind !== "line" && to.kind !== "line") {
		return;
	}
	if (lineKey(from) === lineKey(to)) {
		return;
	}
	throw new ORPCError("BAD_REQUEST", {
		message: `Can't move this customer to a plan on ${lineLabel(to)}: they are on ${lineLabel(from)}. Moving a subscriber between dealer lines isn't supported — create a new subscription on the other line instead.`,
	});
}

/** Refuse a plan that belongs to neither the master nor an internal line. */
export function assertOwnPlan(
	plan: PlanDealerFields,
	lines: OrgDealerLines,
): PlanLine {
	const line = resolvePlanLine(plan, lines);
	if (line.kind === "foreign") {
		throw new ORPCError("BAD_REQUEST", {
			message: "This plan belongs to another dealer",
		});
	}
	return line;
}

/**
 * The iRadius `User.ParentId` for a new subscriber on `plan`.
 *
 * iRadius's NEW USER charge bills the dealer that owns the AccountType, so the
 * subscriber must sit under that same dealer: a plan on an internal line puts
 * it under the line (the local customer keeps the master's `dealerId`, as the
 * sync does); any other plan keeps the customer's own dealer. A plan owned by
 * a different iRadius dealer than the resolved parent is refused — creating
 * it would charge one dealer for another's subscriber.
 */
export function resolveNewSubscriberParent(
	customer: { dealerId: string | null; dealerExternalId: string | null },
	plan: PlanDealerFields,
	lines: OrgDealerLines,
): string | null {
	const line = resolvePlanLine(plan, lines);
	if (line.kind === "line") {
		if (customer.dealerId !== (lines.master?.id ?? null)) {
			throw new ORPCError("BAD_REQUEST", {
				message: `This plan is on the ${line.name} line, but the customer isn't under this organization's dealer`,
			});
		}
		return line.externalId;
	}
	const parentId = customer.dealerExternalId;
	if (
		parentId !== null &&
		plan.dealerExternalId !== null &&
		plan.dealerExternalId !== parentId
	) {
		throw new ORPCError("BAD_REQUEST", {
			message:
				"This plan belongs to a different dealer than the customer — pick one of your own plans",
		});
	}
	return parentId;
}

function lineLabel(line: PlanLine): string {
	if (line.kind === "line") {
		return `the ${line.name} line`;
	}
	return line.kind === "master" ? "the main line" : "another dealer";
}
