"use client";

import { CheckCheckIcon, CheckIcon } from "lucide-react";

export function DeliveryTicks({
	status,
}: {
	status: string | null | undefined;
}) {
	if (!status || status === "sent") {
		return <CheckIcon className="size-3 text-muted-foreground" />;
	}
	if (status === "delivered") {
		return <CheckCheckIcon className="size-3 text-muted-foreground" />;
	}
	if (status === "read") {
		return <CheckCheckIcon className="size-3 text-blue-500" />;
	}
	return null;
}
