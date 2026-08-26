/**
 * The money model — the single definition of what counts as money in this
 * business. Nothing outside this file may decide whether a row is income.
 *
 * ## Why this file exists
 *
 * Before it, there was no definition of revenue anywhere in the codebase.
 * `cash_collection` is a cash-POSITION ledger: it answers "how much does Walid
 * owe the office right now?". Twelve different stats procedures reached into
 * it and summed the answer as if it were a profit-and-loss statement.
 *
 * That produced a headline that was wrong by ~$56,000 every month — the app
 * reported −$34,199 for July 2026, a month the business actually netted
 * +$22,105. Two mechanical faults did it:
 *
 *   1. `EXPENSE_DEDUCTION` rows (the cash-ledger mirror of every approved
 *      expense) were swept into "handed off" as POSITIVE amounts, and the same
 *      expenses were then subtracted again. They cancelled exactly, so
 *      expenses moved the headline by zero.
 *   2. Wholesale revenue — roughly half the business — was never in the app at
 *      all, while every cost of serving it was.
 *
 * The fix is not a better formula. It is giving every row a KIND, once, here.
 */

/**
 * What a row means for the business.
 *
 * - `REVENUE` — money the company earned. Increases profit.
 * - `COST`    — money the company spent to operate. Decreases profit.
 * - `DRAW`    — money taken out by an owner or partner. Real cash out, but NOT
 *               a cost of running the business. Reported below operating
 *               profit so "am I profitable?" and "what did I pay myself?" stay
 *               separate questions.
 * - `TRANSFER`— cash changing hands between people inside the company. A
 *               collector hands cash to the office; the office fronts a worker
 *               money for parts. Nothing was earned or spent. NEVER counts
 *               toward profit — it only moves a balance.
 */
export type MoneyKind = "REVENUE" | "COST" | "DRAW" | "TRANSFER";

/** Where a unit of revenue came from. Retail and wholesale are different
 *  businesses with very different margins and must never be blended into one
 *  number on a report. */
export type RevenueStream = "RETAIL" | "WHOLESALE" | "OTHER";

/**
 * Every `CashCollectionType`, classified.
 *
 * Read this table as: "if I sum this cash-ledger type, what am I summing?"
 *
 * The overwhelming majority are TRANSFER. That is the whole point — the cash
 * ledger tracks WHERE money is, not whether it was earned. Only one type
 * (`STORE_PURCHASE`) is genuinely revenue, and it is small.
 */
export const CASH_TYPE_KIND: Record<string, MoneyKind> = {
	/** Collector hands his collected cash to the office. Already counted as
	 *  revenue when the Payment row was created — counting it again here would
	 *  double the retail line. */
	HANDOFF: "TRANSFER",

	/** Mirror row for an approved expense, so the payer's cash-in-hand drops.
	 *  The Expense row is the cost. This is only its shadow in the ledger.
	 *  Summing both is the double-count that broke the old net total. */
	EXPENSE_DEDUCTION: "TRANSFER",

	/** Worker received stock. Inventory movement, not a P&L event. */
	STOCK_RECEIVED: "TRANSFER",

	/** Hardware consumed on an install, charged against the worker's cash. */
	INSTALLATION_COST: "TRANSFER",

	/** Setup fee collected at activation, charged against the worker's cash. */
	NEW_USER_SETUP: "TRANSFER",

	/** A sub-dealer paying the company for wholesale service. This IS revenue
	 *  — but it is recognised from the dealer-charge ledger, not from here, so
	 *  that paying and owing stay distinguishable. The cash row is the
	 *  settlement, not the sale. */
	DEALER_PAYMENT: "TRANSFER",

	/** Office moves cash between two of its own people. */
	ADMIN_TRANSFER: "TRANSFER",

	/** Money handed TO a worker (advance, salary, reimbursement). The COST is
	 *  the Expense row that funds it, if one exists. */
	SALARY: "TRANSFER",

	/** Worker bought a company item out of his collected cash. Genuine income:
	 *  the company sold something and kept the money. */
	STORE_PURCHASE: "REVENUE",

	/** Company cash given to a worker to hold and spend on our behalf. He owes
	 *  it back. Becomes a cost only when he actually spends it and files an
	 *  expense. */
	CASH_FLOAT: "TRANSFER",

	OTHER: "TRANSFER",
};

/**
 * iRadius `DealerBillingLog.Type` values that represent a real charge to a
 * sub-dealer — i.e. wholesale revenue. Verified against production on
 * 2026-08-26; `RENEW` alone is ~85% of the value.
 */
export const WHOLESALE_CHARGE_TYPES = [
	"RENEW",
	"NEW USER",
	"ADD EXTRA TIME",
	"CHANGE ACCOUNT",
	"DEBIT",
	"RESET FUP",
	"SEND SMS",
	"ADD EXTRA GB",
] as const;

/**
 * The master dealer's own iRadius id.
 *
 * iRadius charges the operator for his OWN subscribers at an internal transfer
 * price (~$30k/month). That is bookkeeping inside one pocket — it is neither
 * revenue nor cost, and including it would roughly double the wholesale line.
 * Retail revenue for these same subscribers is recognised from `Payment`.
 *
 * Stored per-organization on `IspDealer.externalId`; this constant is only the
 * documented default for Liban-Com.
 */
export const MASTER_DEALER_EXTERNAL_ID = "53853";

/** True when a cash-ledger row should be ignored by every profit calculation. */
export function isTransfer(cashType: string): boolean {
	return (CASH_TYPE_KIND[cashType] ?? "TRANSFER") === "TRANSFER";
}

/** Classify a cash-ledger row. Unknown types are TRANSFER — the safe default,
 *  because inventing revenue is far worse than missing it. */
export function kindOfCashType(cashType: string): MoneyKind {
	return CASH_TYPE_KIND[cashType] ?? "TRANSFER";
}

/**
 * A single line on the profit-and-loss statement.
 * `kind` decides which side it lands on; nothing downstream re-decides.
 */
export interface MoneyLine {
	kind: MoneyKind;
	/** Human label, already in the owner's language. */
	label: string;
	amount: number;
	/** Only set when `kind === "REVENUE"`. */
	stream?: RevenueStream;
	/** FinanceCategory id, when the line came from a classified expense. */
	categoryId?: string | null;
}

/**
 * Fold a set of classified lines into the numbers an owner actually asks for.
 *
 * `operatingProfit` deliberately excludes draws: it answers "does the business
 * make money?". `net` includes them: it answers "how much did the pile grow?".
 * Showing only one of the two is how an owner ends up believing a profitable
 * company is losing money.
 */
export function foldLines(lines: MoneyLine[]) {
	let revenue = 0;
	let cost = 0;
	let draws = 0;
	const byStream: Record<RevenueStream, number> = {
		RETAIL: 0,
		WHOLESALE: 0,
		OTHER: 0,
	};

	for (const line of lines) {
		if (line.kind === "REVENUE") {
			revenue += line.amount;
			byStream[line.stream ?? "OTHER"] += line.amount;
		} else if (line.kind === "COST") {
			cost += line.amount;
		} else if (line.kind === "DRAW") {
			draws += line.amount;
		}
		// TRANSFER contributes to nothing. That is the entire fix.
	}

	return {
		revenue,
		cost,
		draws,
		byStream,
		operatingProfit: revenue - cost,
		net: revenue - cost - draws,
	};
}
