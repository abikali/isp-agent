/**
 * Labels and badge tones for every `CashCollectionType`, shared by the three
 * cash-ledger tables (worker, collector, handoffs).
 *
 * Each table used to carry its own ternary ladder whose fallback was
 * "Expense" in destructive red. A DEALER_PAYMENT — a dealer settling what he
 * owes, cash the worker is holding for the office — fell through to that
 * fallback and read as money leaving the business. The fallback here is
 * neutral on purpose: an unknown type must never impersonate a cost.
 */
export const CASH_TYPE_LABELS: Record<string, string> = {
	HANDOFF: "Handoff",
	EXPENSE_DEDUCTION: "Expense",
	CASH_FLOAT: "Float",
	SALARY: "His pay",
	STORE_PURCHASE: "Purchase",
	DEALER_PAYMENT: "Dealer payment",
	ADMIN_TRANSFER: "Transfer",
	STOCK_RECEIVED: "Stock received",
	INSTALLATION_COST: "Installation",
	NEW_USER_SETUP: "New user setup",
	OTHER: "Other",
};

const NEUTRAL_TONE = "border-border bg-muted text-foreground";

export const CASH_TYPE_TONES: Record<string, string> = {
	HANDOFF: "border-success/40 bg-success/10 text-success",
	DEALER_PAYMENT: "border-success/40 bg-success/10 text-success",
	CASH_FLOAT: "border-primary/40 bg-primary/10 text-primary",
	SALARY: NEUTRAL_TONE,
	ADMIN_TRANSFER: NEUTRAL_TONE,
	STOCK_RECEIVED: NEUTRAL_TONE,
	OTHER: NEUTRAL_TONE,
	STORE_PURCHASE: "border-warning/40 bg-warning/10 text-warning",
	INSTALLATION_COST: "border-warning/40 bg-warning/10 text-warning",
	NEW_USER_SETUP: "border-warning/40 bg-warning/10 text-warning",
	EXPENSE_DEDUCTION:
		"border-destructive/40 bg-destructive/10 text-destructive",
};

export function cashTypeLabel(type: string): string {
	return CASH_TYPE_LABELS[type] ?? type;
}

export function cashTypeTone(type: string): string {
	return CASH_TYPE_TONES[type] ?? NEUTRAL_TONE;
}
