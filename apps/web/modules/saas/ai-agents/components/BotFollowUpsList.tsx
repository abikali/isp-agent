"use client";

import { EmptyState } from "@shared/components/EmptyState";
import { Button } from "@ui/components/button";
import { Card } from "@ui/components/card";
import { MessageCircleReplyIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	type BotFollowUpTab,
	useApproveBotFollowUps,
	useBotFollowUps,
	useSendBotFollowUpNow,
	useSkipBotFollowUps,
} from "../hooks/use-bot-follow-ups";
import { BotFollowUpRow } from "./BotFollowUpRow";

const EMPTY_TEXT: Record<BotFollowUpTab, string> = {
	approval: "Nothing is waiting for approval.",
	scheduled: "No follow-ups are scheduled.",
	waiting: "No follow-ups are waiting for an answer.",
	done: "No finished follow-ups yet.",
};

/**
 * One tab of the Bot follow-ups page. On "Awaiting approval", rows can be
 * picked and approved or skipped in bulk; the preview shows the template
 * text the customer will get.
 */
export function BotFollowUpsList({
	organizationId,
	organizationSlug,
	tab,
}: {
	organizationId: string;
	organizationSlug: string;
	tab: BotFollowUpTab;
}) {
	const { items } = useBotFollowUps({ organizationId, tab });
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const approve = useApproveBotFollowUps();
	const skip = useSkipBotFollowUps();
	const sendNow = useSendBotFollowUpNow();
	const selectable = tab === "approval";
	const ids = [...selected].filter((id) => items.some((i) => i.id === id));

	function toggle(id: string, checked: boolean) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (checked) {
				next.add(id);
			} else {
				next.delete(id);
			}
			return next;
		});
	}

	async function handleApprove() {
		try {
			const { approved } = await approve.mutateAsync({
				organizationId,
				ids,
			});
			toast.success(`${approved} approved — they go out when due`);
			setSelected(new Set());
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed");
		}
	}

	async function handleSkip() {
		try {
			const { skipped } = await skip.mutateAsync({ organizationId, ids });
			toast.success(`${skipped} skipped`);
			setSelected(new Set());
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed");
		}
	}

	async function handleSendNow() {
		const [id] = ids;
		if (!id || ids.length !== 1) {
			return;
		}
		try {
			const result = await sendNow.mutateAsync({ organizationId, id });
			toast.info(`Follow-up ${result.status.replace("_", " ")}`);
			setSelected(new Set());
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed");
		}
	}

	if (items.length === 0) {
		return (
			<EmptyState
				icon={MessageCircleReplyIcon}
				title={EMPTY_TEXT[tab]}
				description="Check-backs, silence nudges and official-number outreach appear here with their results."
			/>
		);
	}

	return (
		<div className="space-y-3">
			{selectable && (
				<div className="flex flex-wrap items-center gap-2">
					<Button
						size="sm"
						variant="outline"
						onClick={() =>
							setSelected(
								ids.length === items.length
									? new Set()
									: new Set(items.map((i) => i.id)),
							)
						}
					>
						{ids.length === items.length
							? "Clear selection"
							: "Select all"}
					</Button>
					<Button
						size="sm"
						disabled={ids.length === 0 || approve.isPending}
						onClick={handleApprove}
					>
						Approve {ids.length > 0 ? ids.length : ""}
					</Button>
					<Button
						size="sm"
						variant="outline"
						disabled={ids.length === 0 || skip.isPending}
						onClick={handleSkip}
					>
						Skip
					</Button>
					<Button
						size="sm"
						variant="ghost"
						disabled={ids.length !== 1 || sendNow.isPending}
						onClick={handleSendNow}
					>
						Send now
					</Button>
				</div>
			)}
			<Card className="overflow-hidden p-0">
				{items.map((item) => (
					<BotFollowUpRow
						key={item.id}
						item={item}
						organizationSlug={organizationSlug}
						selected={selected.has(item.id)}
						onSelect={
							selectable
								? (checked) => toggle(item.id, checked)
								: undefined
						}
					/>
				))}
			</Card>
		</div>
	);
}
