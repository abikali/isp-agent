import { ORPCError } from "@orpc/server";
import { hasPermission, requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";

/**
 * Who may see — and touch — which dealers' money.
 *
 * Dealers and their ledgers are GLOBAL rows (no organizationId): they mirror
 * iRadius, where there is one dealer tree for the whole network. Scoping is
 * therefore decided per organization, not per row:
 *
 * - The wholesale operator (`Organization.isWholesaleOperator`, Liban-Com)
 *   sees every dealer except its own master account, and is the only party
 *   that can add credit or record a payment — those are writes to iRadius
 *   that only the network owner is entitled to make.
 * - A reseller organization sees exactly one dealer: itself. Its page reads
 *   "your account with the operator" and offers no actions.
 */
export interface DealerScope {
	organizationId: string;
	userId: string;
	/** The organization's own dealer account (the master, for the operator). */
	activeDealerId: string | null;
	/** True for the network owner: every dealer is in scope. */
	isOperator: boolean;
	/** Add credit / record payment allowed (operator + `dealers:manage`). */
	canManage: boolean;
	iradiusDisabled: boolean;
}

export async function resolveDealerScope(
	organizationId: string,
	userId: string,
	action: "read" | "manage",
): Promise<DealerScope> {
	const { activeDealerId, permCtx } = await requirePermission(
		organizationId,
		userId,
		"dealers",
		action,
	);

	const organization = await db.organization.findUnique({
		where: { id: organizationId },
		select: { isWholesaleOperator: true, iradiusDisabled: true },
	});
	if (!organization) {
		throw new ORPCError("NOT_FOUND", { message: "Organization not found" });
	}

	const isOperator = organization.isWholesaleOperator;

	return {
		organizationId,
		userId,
		activeDealerId: activeDealerId ?? null,
		isOperator,
		canManage: isOperator && hasPermission(permCtx, "dealers", "manage"),
		iradiusDisabled: organization.iradiusDisabled,
	};
}

/** Prisma `where` fragment selecting the dealers this scope may see. */
export function dealerWhereForScope(scope: DealerScope): {
	id?: string | { not: string };
} {
	if (scope.isOperator) {
		// `id` is non-nullable, so `not` cannot accidentally drop null rows.
		return scope.activeDealerId
			? { id: { not: scope.activeDealerId } }
			: {};
	}
	// A reseller with no dealer assigned sees nothing rather than everything.
	return { id: scope.activeDealerId ?? "__no_dealer__" };
}

export const scopedDealerSelect = {
	id: true,
	name: true,
	username: true,
	companyName: true,
	externalId: true,
	credit: true,
	notificationAmount: true,
	status: true,
	deletedAt: true,
	lastSyncedAt: true,
	parentDealerId: true,
	parentDealer: { select: { id: true, name: true } },
	_count: { select: { customers: true } },
} as const;

/** Load one dealer, refusing anything outside the caller's scope. */
export async function requireDealerInScope(
	scope: DealerScope,
	dealerId: string,
) {
	// AND, not spread: the scope fragment also keys on `id`, and a spread
	// would replace the requested id with the scope's exclusion — returning
	// whichever dealer sorts first instead of the one asked for.
	const dealer = await db.ispDealer.findFirst({
		where: { AND: [{ id: dealerId }, dealerWhereForScope(scope)] },
		select: scopedDealerSelect,
	});
	if (!dealer) {
		throw new ORPCError("NOT_FOUND", { message: "Dealer not found" });
	}
	return dealer;
}
