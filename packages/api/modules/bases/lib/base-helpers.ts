import { ORPCError } from "@orpc/server";
import { getDealerScopeFilter } from "@repo/api/lib/permission";
import { db, type Prisma } from "@repo/database";

/**
 * Shared select for base reads. `workers` is returned as the join rows; use
 * {@link mapBaseWorkers} to flatten it into a plain `{ id, name }[]` list.
 */
export const baseSelect = {
	id: true,
	name: true,
	description: true,
	address: true,
	createdAt: true,
	updatedAt: true,
	dealer: { select: { id: true, name: true } },
	workers: {
		select: {
			employee: { select: { id: true, name: true } },
		},
		orderBy: { employee: { name: "asc" } },
	},
} satisfies Prisma.BaseSelect;

type BaseWithWorkers = Prisma.BaseGetPayload<{ select: typeof baseSelect }>;

/** Flatten the join rows into the worker employees themselves. */
export function mapBaseWorkers(base: BaseWithWorkers) {
	const { workers, ...rest } = base;
	return { ...rest, workers: workers.map((w) => w.employee) };
}

/**
 * Verify every selected worker is an employee in this org and dealer scope.
 * Throws BAD_REQUEST if any id is unknown / out of scope. No-op for an empty list.
 */
export async function assertWorkersInScope(
	organizationId: string,
	activeDealerId: string | null,
	workerIds: string[],
): Promise<string[]> {
	const unique = [...new Set(workerIds)];
	if (unique.length === 0) {
		return unique;
	}
	const count = await db.employee.count({
		where: {
			id: { in: unique },
			organizationId,
			deletedAt: null,
			...getDealerScopeFilter(activeDealerId),
		},
	});
	if (count !== unique.length) {
		throw new ORPCError("BAD_REQUEST", {
			message: "One or more selected workers are invalid.",
		});
	}
	return unique;
}
