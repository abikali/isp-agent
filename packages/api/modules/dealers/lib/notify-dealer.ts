import { db, type Prisma } from "@repo/database";
import { extractPhoneNumbers } from "@repo/database/phones";
import {
	type DealerWhatsAppNotice,
	queueWhatsAppTemplateRetry,
	sendWhatsAppDealerAccountUpdate,
} from "@repo/jobs";
import { logger } from "@repo/logs";
import { beirutParts, parsePhone } from "@repo/utils";
import type { LedgerKind } from "./ledger";

/**
 * WhatsApp a dealer about money recorded on his account.
 *
 * Sent from the OFFICIAL number (Salti/WPBox, template
 * `dealer_account_update`), never from the support bot's WaSender number:
 * business-initiated sends from the bot risk getting it banned, and the bot's
 * own echo used to flip the dealer's chat into human takeover.
 *
 * Best-effort by design: the ledger write already succeeded, so nothing here
 * throws. The outcome is stored on the ledger row (`whatsappNotice`) and
 * returned so staff see whether the dealer heard about it — and can resend.
 */

export type DealerNotice = Pick<
	DealerWhatsAppNotice,
	"status" | "phone" | "error"
>;

const OPERATION_LABELS: Record<LedgerKind, string> = {
	payment: "دفعة",
	bonus: "بونص",
	write_off: "شطب دين",
	in_kind: "تسوية عينية",
	adjustment: "تسوية",
	top_up: "إضافة رصيد",
	deduction: "خصم رصيد",
};

/** WhatsApp caps note-like params; the ledger note is ≤200 anyway. */
const MAX_PARAM_LENGTH = 200;

/**
 * Template params may not contain newlines, tabs or runs of spaces, and may
 * not be empty — Meta rejects the whole send otherwise.
 */
function templateText(value: string | null | undefined): string {
	const clean = (value ?? "").replace(/\s+/g, " ").trim();
	return clean ? clean.slice(0, MAX_PARAM_LENGTH) : "-";
}

function usd(amount: number): string {
	return `$${amount.toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
}

function beirutDate(date: Date): string {
	const { year, month, day } = beirutParts(date);
	return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** iRadius names dealers with no first/last name "Unknown". */
function greetingName(dealer: {
	name: string;
	companyName: string | null;
	username: string | null;
}): string {
	const name = dealer.name.trim();
	if (name && name.toLowerCase() !== "unknown") {
		return name;
	}
	return dealer.companyName?.trim() || dealer.username?.trim() || name;
}

/**
 * The seven `dealer_account_update` body params, in template order: name,
 * operation, amount, date (Beirut), what is still owed, prepaid credit, note.
 */
export function buildDealerNoticeParams(input: {
	dealer: {
		name: string;
		companyName: string | null;
		username: string | null;
	};
	kind: LedgerKind;
	amount: number;
	operationDate: Date;
	owed: number;
	prepaid: number;
	note: string | null;
}): string[] {
	const owed =
		input.owed >= 0.005
			? usd(input.owed)
			: input.owed <= -0.005
				? `لا شيء — لديك ${usd(-input.owed)} لصالحك`
				: "لا شيء — حسابك مسدد";
	return [
		templateText(greetingName(input.dealer)),
		OPERATION_LABELS[input.kind],
		usd(input.amount),
		beirutDate(input.operationDate),
		owed,
		usd(input.prepaid),
		templateText(input.note),
	];
}

export type DealerPhoneResolution =
	| { status: "ok"; phone: string }
	| { status: "no_phone"; phone: null }
	| { status: "invalid_phone"; phone: string };

/**
 * First valid WhatsApp number among the dealer's phone fields, in priority
 * order. iRadius phone columns are dirty ("70123456-71234567", names, a digit
 * too many), so each field is split into numbers and only one libphonenumber
 * validates is used — the same check the WPBox sender applies.
 */
export function resolveDealerWhatsAppPhone(
	candidates: Array<string | null | undefined>,
): DealerPhoneResolution {
	let firstRaw: string | null = null;
	for (const raw of candidates) {
		const trimmed = raw?.trim();
		if (!trimmed) {
			continue;
		}
		firstRaw ??= trimmed;
		for (const number of extractPhoneNumbers(trimmed)) {
			const digits = parsePhone(number)?.digits;
			if (digits) {
				return { status: "ok", phone: digits };
			}
		}
	}
	return firstRaw
		? { status: "invalid_phone", phone: firstRaw }
		: { status: "no_phone", phone: null };
}

async function saveNotice(
	dealerAccountId: string,
	notice: DealerWhatsAppNotice,
): Promise<void> {
	await db.ispDealerAccount.update({
		where: { id: dealerAccountId },
		data: { whatsappNotice: notice as unknown as Prisma.InputJsonValue },
	});
}

/**
 * Send (or, with `send: false`, just record as skipped) the confirmation for
 * one ledger row, store the outcome on it, and queue a retry when WPBox
 * failed transiently.
 */
export async function notifyDealerWhatsApp(input: {
	dealerId: string;
	dealerAccountId: string;
	params: string[];
	send: boolean;
}): Promise<DealerNotice> {
	const notice: DealerWhatsAppNotice = {
		status: "skipped",
		phone: null,
		params: input.params,
		error: null,
		messageId: null,
		updatedAt: new Date().toISOString(),
	};
	try {
		if (input.send) {
			const dealer = await db.ispDealer.findUnique({
				where: { id: input.dealerId },
				select: {
					phone: true,
					companyMobile: true,
					companyPhone: true,
				},
			});
			const resolved = resolveDealerWhatsAppPhone([
				dealer?.phone,
				dealer?.companyMobile,
				dealer?.companyPhone,
			]);
			notice.phone = resolved.phone;
			if (resolved.status !== "ok") {
				notice.status = resolved.status;
			} else if (!process.env["WPBOX_TOKEN"]) {
				notice.status = "not_configured";
			} else {
				const result = await sendWhatsAppDealerAccountUpdate({
					phone: resolved.phone,
					params: input.params,
					dealerAccountId: input.dealerAccountId,
				});
				if (result.ok) {
					notice.status = "sent";
					notice.messageId = result.messageId;
				} else if (result.retriable) {
					notice.error = result.error;
					await queueWhatsAppTemplateRetry({
						kind: "dealer_account_update",
						dealerAccountId: input.dealerAccountId,
						phone: resolved.phone,
						params: input.params,
					});
					notice.status = "retrying";
				} else {
					notice.status = "failed";
					notice.error = result.error;
				}
			}
		}
	} catch (error) {
		logger.warn("[dealers] dealer WhatsApp notify failed", {
			dealerId: input.dealerId,
			dealerAccountId: input.dealerAccountId,
			error: String(error),
		});
		notice.status = "failed";
		notice.error = error instanceof Error ? error.message : String(error);
	}
	// Report what happened to the message even if remembering it fails.
	await saveNotice(input.dealerAccountId, notice).catch((error: unknown) =>
		logger.warn("[dealers] could not store dealer WhatsApp outcome", {
			dealerAccountId: input.dealerAccountId,
			status: notice.status,
			error: String(error),
		}),
	);
	return { status: notice.status, phone: notice.phone, error: notice.error };
}

/** Read a stored notice defensively — it is a Json column. */
export function readDealerNotice(
	value: Prisma.JsonValue | null,
): DealerWhatsAppNotice | null {
	if (
		value === null ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		typeof value["status"] !== "string"
	) {
		return null;
	}
	return value as unknown as DealerWhatsAppNotice;
}
