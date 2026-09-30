"use client";

import { Badge } from "@ui/components/badge";
import { useBotFollowUpStats } from "../hooks/use-bot-follow-ups";
import {
	FOLLOW_UP_OUTCOME_LABELS,
	FOLLOW_UP_TYPE_LABELS,
} from "../lib/bot-follow-up-labels";

/**
 * Counts per follow-up type: sent / answered, and the answers themselves —
 * for stops, the churn reasons.
 */
export function BotFollowUpStats({
	organizationId,
}: {
	organizationId: string;
}) {
	const { data } = useBotFollowUpStats(organizationId);
	if (!data) {
		return null;
	}
	const types = [...new Set(data.byStatus.map((r) => r.type))];
	if (types.length === 0) {
		return null;
	}
	const count = (type: string, statuses: string[]) =>
		data.byStatus
			.filter((r) => r.type === type && statuses.includes(r.status))
			.reduce((sum, r) => sum + r.count, 0);

	return (
		<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			{types.map((type) => {
				const sent = count(type, [
					"sent",
					"replied",
					"resolved",
					"no_reply",
				]);
				const answered = count(type, ["replied", "resolved"]);
				const waiting = count(type, ["pending_approval", "scheduled"]);
				const outcomes = data.byOutcome.filter(
					(r) => r.type === type && r.outcome !== "no_reply",
				);
				return (
					<div
						key={type}
						className="space-y-1.5 rounded-lg border border-border bg-card px-3 py-2.5 text-xs"
					>
						<div className="font-medium text-sm">
							{FOLLOW_UP_TYPE_LABELS[type] ?? type}
						</div>
						<div className="text-muted-foreground">
							<span className="font-medium text-foreground">
								{sent}
							</span>{" "}
							sent ·{" "}
							<span className="font-medium text-foreground">
								{answered}
							</span>{" "}
							answered
							{waiting > 0 ? ` · ${waiting} queued` : ""}
						</div>
						{outcomes.length > 0 && (
							<div className="flex flex-wrap gap-1">
								{outcomes.map((o) => (
									<Badge key={o.outcome} variant="secondary">
										{FOLLOW_UP_OUTCOME_LABELS[o.outcome] ??
											o.outcome}{" "}
										{o.count}
									</Badge>
								))}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
