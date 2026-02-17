"use client";

import { Badge } from "@ui/components/badge";

const statusConfig = {
	up: { label: "Up", variant: "default" as const },
	down: { label: "Down", variant: "destructive" as const },
	unknown: { label: "Unknown", variant: "secondary" as const },
};

export function WatcherStatusBadge({ status }: { status: string }) {
	const config =
		statusConfig[status as keyof typeof statusConfig] ??
		statusConfig.unknown;

	return <Badge variant={config.variant}>{config.label}</Badge>;
}
