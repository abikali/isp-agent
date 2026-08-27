import {
	getDealerScopeFilter,
	getOwnershipFilterAsync,
	type PermissionContext,
} from "@repo/api/lib/permission";
import z from "zod";

/**
 * The one definition of "which expenses is this request asking about".
 *
 * Every expense reader MUST build its `where` from this. `list` and `summary`
 * take the full filter set so the stat cards can never describe a different
 * set of rows than the table below them; `filterOptions` takes only the status
 * tab, so a picked worker/bucket never hides the other choices.
 */
export const expenseFilterSchema = z.object({
	organizationId: z.string(),
	search: z.string().optional(),
	status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
	employeeId: z.string().optional(),
	/** Legacy free-text bucket (toolkit | electricity | roof | salary | other). */
	category: z.string().optional(),
	/** Money-map bucket id, or the literal "none" for rows nobody classified. */
	financeCategoryId: z.string().optional(),
	hasReceipt: z.boolean().optional(),
	from: z.coerce.date().optional(),
	to: z.coerce.date().optional(),
});

export type ExpenseFilterInput = z.infer<typeof expenseFilterSchema>;

export async function buildExpenseWhere(
	permCtx: PermissionContext,
	activeDealerId: string | null,
	input: ExpenseFilterInput,
): Promise<Record<string, unknown>> {
	const ownershipFilter = await getOwnershipFilterAsync(
		permCtx,
		"expenses",
		"read",
	);

	const and: Record<string, unknown>[] = [];

	if (input.status) {
		and.push({ status: input.status });
	}
	if (input.employeeId) {
		and.push({ submittedById: input.employeeId });
	}
	if (input.category) {
		and.push({ category: input.category });
	}
	if (input.financeCategoryId) {
		and.push(
			input.financeCategoryId === "none"
				? { financeCategoryId: null }
				: { financeCategoryId: input.financeCategoryId },
		);
	}
	if (input.hasReceipt !== undefined) {
		and.push(
			input.hasReceipt
				? { receiptUrl: { not: null } }
				: { receiptUrl: null },
		);
	}
	if (input.from || input.to) {
		and.push({
			createdAt: {
				...(input.from ? { gte: input.from } : {}),
				...(input.to ? { lte: input.to } : {}),
			},
		});
	}
	if (input.search) {
		const contains = { contains: input.search, mode: "insensitive" };
		and.push({
			OR: [
				{ description: contains },
				{ category: contains },
				{ submittedBy: { name: contains } },
			],
		});
	}
	// Ownership goes on last and as its own AND clause: a `read:own` caller must
	// not be able to widen their scope by passing someone else's employeeId.
	if (ownershipFilter) {
		and.push(ownershipFilter);
	}

	return {
		organizationId: input.organizationId,
		submittedBy: getDealerScopeFilter(activeDealerId),
		...(and.length > 0 ? { AND: and } : {}),
	};
}
