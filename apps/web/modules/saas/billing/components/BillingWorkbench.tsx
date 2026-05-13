"use client";

import { PageShell } from "@shared/components/PageShell";
import type { ReactNode } from "react";
import { BillingNav } from "./BillingNav";

interface BillingWorkbenchProps {
	title?: string;
	description?: string;
	actions?: ReactNode;
	children: ReactNode;
}

export function BillingWorkbench({
	title = "Billing",
	description = "Monthly cycle, unpaid customers, invoices, payments, and reports",
	actions,
	children,
}: BillingWorkbenchProps) {
	return (
		<PageShell title={title} description={description} actions={actions}>
			<BillingNav />
			{children}
		</PageShell>
	);
}
