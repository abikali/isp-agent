"use client";

import { useCanAccess } from "@saas/organizations/client";
import { PageShell } from "@shared/components/PageShell";
import { useOrganizationId } from "@shared/lib/organization";
import { Button } from "@ui/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/tabs";
import { PlusIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useRescanFiber } from "../hooks/use-fiber";
import { AddFiberLeadDialog } from "./AddFiberLeadDialog";
import { FiberDefend } from "./FiberDefend";
import { FiberOverviewTab } from "./FiberOverviewTab";
import { FiberPipeline, type PipelineFilters } from "./FiberPipeline";

export type FiberTab = "overview" | "pipeline" | "defend";

/**
 * Fiber control room: where Jhonny sees who might leave for Ogero fiber,
 * works the leads, and decides where to push. Three tabs, one question each:
 * Overview — how are we doing? Pipeline — who do we call today?
 * Defend — who should we reach before Ogero does?
 */
export function FiberControlRoom({
	organizationSlug,
	initialLeadId,
}: {
	organizationSlug: string;
	initialLeadId?: string | undefined;
}) {
	const organizationId = useOrganizationId();
	const canManage = useCanAccess()("marketing", "manage");
	const [tab, setTab] = useState<FiberTab>(
		initialLeadId ? "pipeline" : "overview",
	);
	const [pipelineFilters, setPipelineFilters] = useState<PipelineFilters>({
		stage: "OPEN",
	});
	const [defendArea, setDefendArea] = useState<string | undefined>();
	const [adding, setAdding] = useState(false);
	const rescan = useRescanFiber();

	function openPipeline(filters: PipelineFilters) {
		setPipelineFilters(filters);
		setTab("pipeline");
	}
	function openDefend(area?: string) {
		setDefendArea(area);
		setTab("defend");
	}

	return (
		<PageShell
			title="Fiber"
			description="Win fiber customers before Ogero does — and keep the ones it is targeting."
			actions={
				canManage ? (
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							disabled={rescan.isPending || !organizationId}
							title="Look for fiber / Ogero mentions in the last 60 days of chats, stops and escalations"
							onClick={() =>
								organizationId &&
								rescan.mutate(
									{ organizationId, days: 60 },
									{
										onSuccess: (r) =>
											toast.success(
												r.leadsCreated > 0
													? `Found ${r.leadsCreated} new lead${r.leadsCreated === 1 ? "" : "s"}`
													: "No new leads — everything is already here",
											),
										onError: (e) => toast.error(e.message),
									},
								)
							}
						>
							<RefreshCwIcon
								className={
									rescan.isPending
										? "animate-spin"
										: undefined
								}
							/>
							Scan chats
						</Button>
						<Button onClick={() => setAdding(true)}>
							<PlusIcon />
							Add lead
						</Button>
					</div>
				) : null
			}
		>
			<Tabs value={tab} onValueChange={(v) => setTab(v as FiberTab)}>
				<TabsList>
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="pipeline">Pipeline</TabsTrigger>
					<TabsTrigger value="defend">Defend</TabsTrigger>
				</TabsList>
				<TabsContent value="overview" className="mt-4">
					<FiberOverviewTab
						organizationSlug={organizationSlug}
						canManage={canManage}
						onOpenPipeline={openPipeline}
						onOpenDefend={openDefend}
					/>
				</TabsContent>
				<TabsContent value="pipeline" className="mt-4">
					<FiberPipeline
						organizationSlug={organizationSlug}
						canManage={canManage}
						filters={pipelineFilters}
						initialLeadId={initialLeadId}
						onFiltersChange={setPipelineFilters}
					/>
				</TabsContent>
				<TabsContent value="defend" className="mt-4">
					<FiberDefend
						key={defendArea ?? "all"}
						organizationSlug={organizationSlug}
						canManage={canManage}
						initialArea={defendArea}
					/>
				</TabsContent>
			</Tabs>
			{/* Mounted only while open so every add starts with an empty form. */}
			{adding && <AddFiberLeadDialog open onOpenChange={setAdding} />}
		</PageShell>
	);
}
