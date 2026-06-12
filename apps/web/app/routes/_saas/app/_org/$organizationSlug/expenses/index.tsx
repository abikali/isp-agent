import { config } from "@repo/config";
import { ExpensesList, ExpensesListSkeleton } from "@saas/expenses/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShellSkeleton } from "@shared/components/PageShellSkeleton";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/expenses/",
)({
	head: () => ({
		meta: [{ title: `Expenses - ${config.appName}` }],
	}),
	component: ExpensesPage,
});

function ExpensesPage() {
	return (
		<PermissionGate resource="expenses" action="read">
			<AsyncBoundary
				fallback={
					<PageShellSkeleton>
						<ExpensesListSkeleton />
					</PageShellSkeleton>
				}
			>
				<ExpensesList />
			</AsyncBoundary>
		</PermissionGate>
	);
}
