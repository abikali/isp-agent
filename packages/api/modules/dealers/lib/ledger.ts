/**
 * Pure helpers for reading the dealer receivable ledger.
 *
 * The ledger mirrors iRadius `DealerAccount`. Each row is either money the
 * operator extended to a dealer (a credit top-up: `credit > 0`) or money that
 * came back (`debit > 0`: cash, a write-off, goods in kind, or credit taken
 * back). What a dealer owes is simply Σcredit − Σdebit.
 *
 * Two things this file exists to get right, both learned from the data:
 *
 * 1. NEVER trust the `balance` column. iRadius stamps it on the row at insert
 *    time as Σcredit − Σdebit for the dealer, so a later back-dated entry
 *    leaves every row after it wrong (kafranet showed 350 while owing 50).
 *    The running balance is always recomputed here.
 *
 * 2. 2023 rows are in Lebanese pounds (hundreds of millions). They net to
 *    zero per dealer but make lifetime sums meaningless, so any "how much
 *    over the last N months" figure skips them.
 */

/** Amounts at or above this are the 2023 LBP-denominated entries. */
export const LEGACY_CURRENCY_THRESHOLD = 100_000;

export type LedgerKind =
	| "top_up"
	| "deduction"
	| "payment"
	| "write_off"
	| "in_kind"
	| "adjustment";

/**
 * Prefix written into the iRadius comment so the entry reads correctly in the
 * legacy UI and classifies back deterministically when it is synced.
 */
export const LEDGER_COMMENT_PREFIX: Record<
	Exclude<LedgerKind, "top_up" | "payment">,
	string
> = {
	deduction: "Credit deducted:",
	write_off: "Write-off:",
	in_kind: "In kind:",
	adjustment: "Adjustment:",
};

export interface LedgerRowInput {
	credit: number;
	debit: number;
	comment: string | null;
}

export function classifyLedgerRow(row: LedgerRowInput): LedgerKind {
	if (row.credit > 0) {
		return "top_up";
	}
	const comment = (row.comment ?? "").trim();
	const lower = comment.toLowerCase();
	for (const [kind, prefix] of Object.entries(LEDGER_COMMENT_PREFIX)) {
		if (lower.startsWith(prefix.toLowerCase())) {
			return kind as LedgerKind;
		}
	}
	// Legacy convention: the owner typed "free" when forgiving a balance.
	if (lower === "free" || lower.startsWith("free ")) {
		return "write_off";
	}
	return "payment";
}

/** The comment without the machine prefix, for display. */
export function displayNote(comment: string | null): string | null {
	const trimmed = (comment ?? "").trim();
	if (!trimmed) {
		return null;
	}
	for (const prefix of Object.values(LEDGER_COMMENT_PREFIX)) {
		if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
			const rest = trimmed.slice(prefix.length).trim();
			return rest || null;
		}
	}
	return trimmed;
}

export function isLegacyCurrency(amount: number): boolean {
	return Math.abs(amount) >= LEGACY_CURRENCY_THRESHOLD;
}

export function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

/** What the dealer owes: credit extended minus what came back. */
export function netOwed(sumCredit: number, sumDebit: number): number {
	return round2(sumCredit - sumDebit);
}

export interface RunningRow<T> {
	row: T;
	balanceAfter: number;
}

/**
 * Walk rows in chronological order and attach the balance AFTER each one.
 * Input must already be sorted ascending by operation date.
 */
export function withRunningBalance<T extends LedgerRowInput>(
	rowsAscending: T[],
): RunningRow<T>[] {
	let balance = 0;
	return rowsAscending.map((row) => {
		balance = round2(balance + row.credit - row.debit);
		return { row, balanceAfter: balance };
	});
}

/**
 * Build the comment stored in iRadius for a payment-side entry. Plain cash
 * payments carry the note as typed (matching what the owner has always done in
 * iRadius); every other kind is prefixed so it can be told apart later.
 */
export function buildLedgerComment(
	kind: Exclude<LedgerKind, "top_up">,
	note: string | null | undefined,
): string | null {
	const clean = (note ?? "").trim();
	if (kind === "payment") {
		return clean || null;
	}
	const prefix = LEDGER_COMMENT_PREFIX[kind];
	return clean ? `${prefix} ${clean}` : prefix;
}
