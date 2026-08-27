import { config } from "@repo/config";
import { ExpensesList } from "@saas/expenses/client";
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
			<ExpensesList />
		</PermissionGate>
	);
}
