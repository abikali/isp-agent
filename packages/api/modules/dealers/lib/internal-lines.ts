import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import { iradiusGetUserParentId } from "../../customers/lib/iradius-api";

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
 * Which of the org's lines a subscriber is on, from their iRadius
 * `User.ParentId`. A parent of 0 or 1 (none, or the iRadius admin) is where
 * the sync falls back to the master, so it counts as the master line.
 */
export function lineOfIRadiusParent(
	parentExternalId: string,
	{ master, lines }: OrgDealerLines,
): PlanLine {
	const line = lines.find((l) => l.externalId === parentExternalId);
	if (line?.externalId) {
		return {
			kind: "line",
			dealerId: line.id,
			externalId: line.externalId,
			name: line.name,
		};
	}
	if (
		parentExternalId === "0" ||
		parentExternalId === "1" ||
		parentExternalId === master?.externalId
	) {
		return { kind: "master" };
	}
	return { kind: "foreign" };
}

/**
 * The line a customer is on right now. iRadius `User.ParentId` decides when it
 * can be read (`readIRadius` and a linked customer): the local plan is
 * conflict-tracked, so it lags behind every move made in iRadius and is null
 * for many synced customers. Otherwise the local plan decides, and a customer
 * with no plan is taken to be on the master line, where every customer lands
 * by default. `parentExternalId` is null when the local plan decided.
 */
export async function resolveCustomerLine(
	customer: { externalId: string | null; plan: PlanDealerFields | null },
	lines: OrgDealerLines,
	readIRadius: boolean,
): Promise<{ line: PlanLine; parentExternalId: string | null }> {
	const parentExternalId =
		readIRadius && customer.externalId
			? await iradiusGetUserParentId(customer.externalId)
			: null;
	if (parentExternalId !== null) {
		return {
			line: lineOfIRadiusParent(parentExternalId, lines),
			parentExternalId,
		};
	}
	return {
		line: customer.plan
			? resolvePlanLine(customer.plan, lines)
			: { kind: "master" },
		parentExternalId: null,
	};
}

function assertSameLine(from: PlanLine, to: PlanLine): void {
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

/**
 * Refuse a plan move between the master and an internal line (or between two
 * lines), judged from the customer's LOCAL plan. The subscriber's
 * `User.ParentId` stays where it is on an account type change, so iRadius
 * would bill one line's credit for the other line's plan — and moving a
 * subscriber between dealers has no sanctioned write.
 *
 * This is the fallback of `assertCustomerStaysOnLine`, which asks iRadius.
 */
export function assertSamePlanLine(
	currentPlan: PlanDealerFields | null,
	newPlan: PlanDealerFields,
	lines: OrgDealerLines,
): void {
	assertSameLine(
		currentPlan ? resolvePlanLine(currentPlan, lines) : { kind: "master" },
		resolvePlanLine(newPlan, lines),
	);
}

/**
 * Refuse moving an existing customer onto a plan of a different dealer line.
 * The line is read from iRadius when `readIRadius` (pass `!iradiusDisabled`)
 * and the customer is linked, from the local plan otherwise — see
 * `resolveCustomerLine`. No iRadius read for an org without internal lines.
 */
export async function assertCustomerStaysOnLine(opts: {
	organizationId: string;
	customer: { externalId: string | null; plan: PlanDealerFields | null };
	newPlan: PlanDealerFields;
	readIRadius: boolean;
}): Promise<void> {
	const lines = await loadOrgDealerLines(opts.organizationId);
	if (lines.lines.length === 0) {
		return;
	}
	const { line, parentExternalId } = await resolveCustomerLine(
		opts.customer,
		lines,
		opts.readIRadius,
	);
	// iRadius moved the subscriber to a dealer outside the org's own lines
	// since the last sync: no plan of ours fits.
	if (parentExternalId !== null && line.kind === "foreign") {
		throw new ORPCError("BAD_REQUEST", {
			message: `In iRadius this customer is under another dealer (#${parentExternalId}). Sync from iRadius before changing their plan.`,
		});
	}
	assertSameLine(line, resolvePlanLine(opts.newPlan, lines));
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
