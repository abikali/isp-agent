import { formatCurrency } from "@shared/lib/format";

/**
 * Settling a month for less than the customer owes — free, stopped, debt, or
 * a short payment — is the collector carrying the customer. Admins review
 * every one of those rows, so the collector is told before it is recorded
 * rather than finding out when the review lands on them.
 */
export const LENIENCY_NOTICE =
	"Carrying a customer without collecting is reviewed by the admin, and action may be taken if this customer has been left too long.";

export function leniencyReason(input: {
	name: string;
	freeAccount: boolean;
	stoppedAccount: boolean;
	debtAccount?: boolean | undefined;
	paidAmount: number;
	totalDue: number;
}): string | null {
	if (input.freeAccount) {
		return `${input.name} is being settled as FREE — nothing is collected for this month.`;
	}
	if (input.stoppedAccount) {
		return `${input.name} is being marked STOPPED — nothing is collected for this month.`;
	}
	if (input.debtAccount) {
		return `${input.name} is being logged as DEBT — nothing is collected and the month stays due.`;
	}
	const shortfall = input.totalDue - input.paidAmount;
	if (input.paidAmount > 0 && shortfall >= 0.01) {
		return `You are collecting ${formatCurrency(input.paidAmount)} of the ${formatCurrency(input.totalDue)} due — ${formatCurrency(shortfall)} stays unpaid.`;
	}
	return null;
}
