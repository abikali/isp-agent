"use client";

import { ShieldAlertIcon } from "lucide-react";

interface NoDealerAssignedProps {
	organizationName: string;
	fullScreen?: boolean;
}

export function NoDealerAssigned({
	organizationName,
	fullScreen = false,
}: NoDealerAssignedProps) {
	const wrapperClass = fullScreen
		? "flex min-h-screen items-center justify-center bg-background p-4 sm:p-8"
		: "flex min-h-[60vh] items-center justify-center p-4 sm:p-8";

	return (
		<div className={wrapperClass}>
			<div className="mx-auto max-w-md text-center">
				<div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
					<ShieldAlertIcon className="size-8 text-amber-600" />
				</div>
				<h1 className="text-2xl font-semibold tracking-tight">
					No Dealer Assigned
				</h1>
				<p className="mt-3 text-muted-foreground">
					<strong>{organizationName}</strong> does not have a dealer
					assigned yet. A dealer must be configured before you can
					access any data.
				</p>
				<p className="mt-4 text-sm text-muted-foreground">
					Please contact your administrator to assign a dealer to this
					organization.
				</p>
			</div>
		</div>
	);
}
