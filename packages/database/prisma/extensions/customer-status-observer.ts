import { Prisma } from "../generated/client";
import { CustomerStatus } from "../generated/enums";

/**
 * Detects `customer.status` transitions on top-level update / updateMany
 * calls and dispatches registered handlers fire-and-forget.
 *
 * Caveats:
 * - `customer.create` / `upsert` are NOT hooked (no meaningful "before" state).
 * - Nested writes (`parent.update({ customer: { update: { status } } })`)
 *   bypass extension hooks; flatten to top-level updates.
 * - Raw SQL bypasses extensions.
 * - Code paths that must not re-trigger sync (e.g. iRadius sync writeback)
 *   should use the unextended `dbRaw` client from `./client`.
 */

export interface CustomerStatusChange {
	customerId: string;
	before: CustomerStatus | null;
	after: CustomerStatus;
}

export type CustomerStatusChangeHandler = (
	change: CustomerStatusChange,
) => void;

const handlers: CustomerStatusChangeHandler[] = [];

export function registerCustomerStatusChangeHandler(
	handler: CustomerStatusChangeHandler,
): void {
	handlers.push(handler);
}

function notify(change: CustomerStatusChange): void {
	for (const handler of handlers) {
		try {
			handler(change);
		} catch {
			// Handlers must not throw; swallow to protect the caller.
		}
	}
}

const STATUS_VALUES = new Set<string>(Object.values(CustomerStatus));
function isStatus(value: unknown): value is CustomerStatus {
	return typeof value === "string" && STATUS_VALUES.has(value);
}

export const customerStatusObserver = Prisma.defineExtension((client) =>
	client.$extends({
		name: "customerStatusObserver",
		query: {
			customer: {
				async update({ args, query }) {
					const nextStatus = (args.data as { status?: unknown })
						?.status;
					if (!isStatus(nextStatus) || handlers.length === 0) {
						return query(args);
					}

					const before = await client.customer.findUnique({
						where: args.where,
						select: { id: true, status: true },
					});

					const result = await query(args);

					if (before && before.status !== nextStatus) {
						notify({
							customerId: before.id,
							before: isStatus(before.status)
								? before.status
								: null,
							after: nextStatus,
						});
					}

					return result;
				},
				async updateMany({ args, query }) {
					const nextStatus = (args.data as { status?: unknown })
						?.status;
					if (!isStatus(nextStatus) || handlers.length === 0) {
						return query(args);
					}

					const affected = await client.customer.findMany({
						where: args.where ?? {},
						select: { id: true, status: true },
					});

					const result = await query(args);

					for (const row of affected) {
						if (row.status !== nextStatus) {
							notify({
								customerId: row.id,
								before: isStatus(row.status)
									? row.status
									: null,
								after: nextStatus,
							});
						}
					}

					return result;
				},
			},
		},
	}),
);
