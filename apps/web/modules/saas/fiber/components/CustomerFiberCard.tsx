"use client";

import {
	FIBER_LOST_REASON_LABELS,
	type FiberLostReason,
	type FiberStage,
} from "@repo/api/modules/fiber/lib/constants";
import { useCanAccess } from "@saas/organizations/client";
import { DetailSection } from "@shared/components/DetailPanel";
import { formatDate } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Link } from "@tanstack/react-router";
import { Button } from "@ui/components/button";
import { toast } from "sonner";
import {
	useCreateFiberLead,
	useFiberLeadForCustomer,
} from "../hooks/use-fiber";
import { StageBadge } from "./StageBadge";

/**
 * Fiber status on the customer page: where this customer stands in the
 * fiber pipeline, or a one-tap "add" for staff who just heard about Ogero.
 */
export function CustomerFiberCard({
	customerId,
	organizationSlug,
}: {
	customerId: string;
	organizationSlug: string;
}) {
	const organizationId = useOrganizationId();
	const can = useCanAccess();
	const canRead = can("marketing", "read");
	const canManage = can("marketing", "manage");
	const create = useCreateFiberLead();
	const { data } = useFiberLeadForCustomer(customerId, canRead);
	if (!canRead || !data) {
		return null;
	}
	const lead = data.lead;

	return (
		<DetailSection
			title="Fiber"
			description="Where this customer stands in the fiber pipeline"
		>
			{lead ? (
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="space-y-1 text-sm">
						<p className="flex flex-wrap items-center gap-2">
							<StageBadge stage={lead.stage as FiberStage} />
							{lead.stage === "LOST" && lead.lostReason && (
								<span className="text-muted-foreground">
									{
										FIBER_LOST_REASON_LABELS[
											lead.lostReason as FiberLostReason
										]
									}
								</span>
							)}
							{lead.nextActionAt && (
								<span className="text-muted-foreground">
									Follow up {formatDate(lead.nextActionAt)}
								</span>
							)}
							<span className="text-muted-foreground">
								· {lead.assignee?.name ?? "Unassigned"}
							</span>
						</p>
						{lead.summary && (
							<p className="text-sm text-muted-foreground">
								{lead.summary}
							</p>
						)}
					</div>
					<Button variant="outline" size="sm" asChild>
						<Link
							to="/app/$organizationSlug/fiber"
							params={{ organizationSlug }}
							search={{ lead: lead.id }}
						>
							Open lead
						</Link>
					</Button>
				</div>
			) : (
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-sm text-muted-foreground">
						Not in the fiber pipeline.
					</p>
					{canManage && organizationId && (
						<Button
							variant="outline"
							size="sm"
							disabled={create.isPending}
							onClick={() =>
								create.mutate(
									{ organizationId, customerId },
									{
										onSuccess: () =>
											toast.success(
												"Added to the fiber pipeline",
											),
										onError: (e) => toast.error(e.message),
									},
								)
							}
						>
							Add to fiber pipeline
						</Button>
					)}
				</div>
			)}
		</DetailSection>
	);
}
