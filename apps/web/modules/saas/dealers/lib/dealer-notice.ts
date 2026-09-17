import { toast } from "sonner";

export type DealerNoticeStatus =
	| "sent"
	| "retrying"
	| "failed"
	| "no_phone"
	| "invalid_phone"
	| "not_configured"
	| "skipped";

export interface DealerNotice {
	status: DealerNoticeStatus;
	phone: string | null;
	error: string | null;
}

/** Sent-to numbers are stored as bare digits; invalid ones as typed. */
function phoneLabel(phone: string | null): string {
	if (!phone) {
		return "";
	}
	return /^\d+$/.test(phone) ? `+${phone}` : phone;
}

/** Short chip text for the ledger timeline. */
export const DEALER_NOTICE_CHIP: Record<
	DealerNoticeStatus,
	{
		label: string;
		variant: "success" | "info" | "warning" | "error" | "outline";
	}
> = {
	sent: { label: "WhatsApp sent", variant: "success" },
	retrying: { label: "WhatsApp retrying", variant: "info" },
	failed: { label: "WhatsApp failed", variant: "error" },
	no_phone: { label: "No WhatsApp number", variant: "warning" },
	invalid_phone: { label: "Invalid WhatsApp number", variant: "warning" },
	not_configured: { label: "WhatsApp not set up", variant: "error" },
	skipped: { label: "WhatsApp not sent", variant: "outline" },
};

/** One-line explanation, used for toasts and the chip's tooltip. */
export function describeDealerNotice(notice: DealerNotice): string {
	switch (notice.status) {
		case "sent":
			return `WhatsApp confirmation sent to ${phoneLabel(notice.phone)} from the official number.`;
		case "retrying":
			return "WhatsApp did not go through yet — retrying automatically.";
		case "failed":
			return `WhatsApp confirmation failed${notice.error ? `: ${notice.error}` : "."}`;
		case "no_phone":
			return "WhatsApp not sent: this dealer has no phone number on file.";
		case "invalid_phone":
			return `WhatsApp not sent: "${notice.phone ?? ""}" is not a valid WhatsApp number.`;
		case "not_configured":
			return "WhatsApp not sent: the official WhatsApp number is not configured.";
		case "skipped":
			return "No WhatsApp confirmation was sent for this entry.";
	}
}

/** Toast the outcome after a money action. Skipped says nothing. */
export function toastDealerNotice(notice: DealerNotice): void {
	const message = describeDealerNotice(notice);
	switch (notice.status) {
		case "sent":
			toast.success(message);
			return;
		case "retrying":
			toast.info(message);
			return;
		case "no_phone":
		case "invalid_phone":
			toast.warning(message);
			return;
		case "failed":
		case "not_configured":
			toast.error(message);
			return;
		case "skipped":
			return;
	}
}
