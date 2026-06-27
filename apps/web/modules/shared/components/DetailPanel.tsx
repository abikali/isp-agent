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
		<Tabs defaultValue={defaultValue} className="space-y-4">
			<div className="no-scrollbar -mx-1 overflow-x-auto px-1">
				<TabsList className="h-auto gap-0.5 bg-transparent p-0">
					{visibleTabs.map((tab) => (
						<TabsTrigger
							key={tab.id}
							value={tab.id}
							className={cn(
								"shrink-0 gap-1.5 rounded-md border-0 px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors",
								"hover:bg-accent/60 hover:text-foreground",
								"data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=active]:shadow-none",
							)}
						>
							{tab.icon && <tab.icon className="size-3.5" />}
							{tab.label}
							{tab.count != null && tab.count > 0 && (
								<Badge
									variant="secondary"
									className="ml-0.5 px-1.5 py-0 text-[10px]"
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
					className="mt-0 space-y-3"
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

// react-doctor-disable-next-line react-doctor/no-multi-comp -- cohesive DetailPanel primitive barrel (panel, section, skeleton)
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
				"space-y-3 rounded-lg border border-border bg-card p-4 shadow-xs",
				className,
			)}
		>
			<div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
				<div>
					<h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
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

// react-doctor-disable-next-line react-doctor/no-multi-comp -- cohesive DetailPanel primitive barrel (panel, section, skeleton)
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
