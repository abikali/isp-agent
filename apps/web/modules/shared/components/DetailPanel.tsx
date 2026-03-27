"use client";

import { Badge } from "@ui/components/badge";
import { Skeleton } from "@ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/tabs";
import { cn } from "@ui/lib";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface DetailTabConfig {
	id: string;
	label: string;
	icon?: LucideIcon;
	count?: number;
	hidden?: boolean;
	content: ReactNode;
}

interface DetailPanelProps {
	tabs: DetailTabConfig[];
	defaultTab?: string;
}

export function DetailPanel({ tabs, defaultTab }: DetailPanelProps) {
	const visibleTabs = tabs.filter((t) => !t.hidden);
	const defaultValue = defaultTab ?? visibleTabs[0]?.id ?? "";

	return (
		<Tabs defaultValue={defaultValue} className="space-y-6">
			<div className="border-b border-border">
				<TabsList className="h-auto gap-1 bg-transparent p-0">
					{visibleTabs.map((tab) => (
						<TabsTrigger
							key={tab.id}
							value={tab.id}
							className="rounded-t-lg border-0 px-4 py-2.5 text-sm font-medium text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
						>
							{tab.icon && <tab.icon className="mr-2 size-4" />}
							{tab.label}
							{tab.count != null && tab.count > 0 && (
								<Badge
									variant="secondary"
									className="ml-2 px-1.5 py-0 text-[10px]"
								>
									{tab.count}
								</Badge>
							)}
						</TabsTrigger>
					))}
				</TabsList>
			</div>
			{visibleTabs.map((tab) => (
				<TabsContent
					key={tab.id}
					value={tab.id}
					className="mt-0 space-y-6"
				>
					{tab.content}
				</TabsContent>
			))}
		</Tabs>
	);
}

interface DetailSectionProps {
	title: string;
	description?: string;
	action?: ReactNode;
	children: ReactNode;
	className?: string;
}

export function DetailSection({
	title,
	description,
	action,
	children,
	className,
}: DetailSectionProps) {
	return (
		<div
			className={cn(
				"rounded-xl bg-card p-6 shadow-card space-y-4",
				className,
			)}
		>
			<div className="flex items-center justify-between">
				<div>
					<h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
						{title}
					</h3>
					{description && (
						<p className="mt-0.5 text-xs text-muted-foreground/70">
							{description}
						</p>
					)}
				</div>
				{action}
			</div>
			{children}
		</div>
	);
}

interface DetailPanelSkeletonProps {
	tabCount?: number;
}

export function DetailPanelSkeleton({
	tabCount = 4,
}: DetailPanelSkeletonProps) {
	return (
		<div className="space-y-6">
			<div className="flex gap-2 border-b pb-2">
				{Array.from({ length: tabCount }).map((_, i) => (
					<Skeleton
						key={`tab-skel-${i}`}
						className="h-9 w-24 rounded-lg"
					/>
				))}
			</div>
			<div className="space-y-6">
				<Skeleton className="h-48 rounded-xl" />
				<Skeleton className="h-32 rounded-xl" />
			</div>
		</div>
	);
}
