"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { toast } from "sonner";
import { useResendDealerNotice } from "../../hooks/use-dealer-finance";
import {
	DEALER_NOTICE_CHIP,
	type DealerNotice,
	describeDealerNotice,
	toastDealerNotice,
} from "../../lib/dealer-notice";

interface DealerNoticeChipProps {
	notice: DealerNotice;
	dealerId: string;
	entryId: string;
	canManage: boolean;
}

/**
 * Whether the dealer got a WhatsApp confirmation for a ledger entry, with a
 * resend for anything that did not go out (or was skipped at the time).
 */
export function DealerNoticeChip({
	notice,
	dealerId,
	entryId,
	canManage,
}: DealerNoticeChipProps) {
	const organizationId = useOrganizationId();
	const resend = useResendDealerNotice();
	const chip = DEALER_NOTICE_CHIP[notice.status];
	const canResend =
		canManage &&
		!!organizationId &&
		notice.status !== "sent" &&
		notice.status !== "retrying";

	async function onResend() {
		if (!organizationId) {
			return;
		}
		try {
			const result = await resend.mutateAsync({
				organizationId,
				dealerId,
				entryId,
			});
			toastDealerNotice(result.dealerNotice);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Could not send the WhatsApp confirmation",
			);
		}
	}

	return (
		<span className="inline-flex items-center gap-1">
			<Badge variant={chip.variant} title={describeDealerNotice(notice)}>
				{chip.label}
			</Badge>
			{canResend && (
				<Button
					type="button"
					variant="link"
					size="sm"
					className="h-auto px-1 py-0 text-xs"
					disabled={resend.isPending}
					onClick={onResend}
				>
					{resend.isPending
						? "Sending…"
						: notice.status === "skipped"
							? "Send"
							: "Resend"}
				</Button>
			)}
		</span>
	);
}
