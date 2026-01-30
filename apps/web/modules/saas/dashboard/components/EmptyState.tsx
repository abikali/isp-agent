"use client";

import { Link } from "@tanstack/react-router";
import { Button } from "@ui/components/button";
import { Sparkles } from "lucide-react";

interface EmptyStateProps {
	organizationSlug: string;
	organizationName: string;
}

export function EmptyState({
	organizationSlug,
	organizationName,
}: EmptyStateProps) {
	return (
		<div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
			<div className="mb-6 flex size-16 items-center justify-center rounded-full bg-primary/10">
				<Sparkles className="size-8 text-primary" />
			</div>
			<h1 className="mb-2 text-2xl font-bold tracking-tight">
				Welcome to {organizationName}
			</h1>
			<p className="mb-6 max-w-md text-muted-foreground">
				Get started by configuring your organization settings.
			</p>
			<Button asChild>
				<Link
					to="/app/$organizationSlug/settings"
					params={{ organizationSlug }}
				>
					Configure Settings
				</Link>
			</Button>
		</div>
	);
}
