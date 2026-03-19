import { db } from "@repo/database";
import { normalizeLebanesPhone } from "./tools/lib/isp-api-client";

/** Detect Whish Money transfer notification messages */
export function isWhishMoneyMessage(text: string): boolean {
	const lower = text.toLowerCase();
	return (
		lower.includes("whish.money") ||
		(lower.includes("w2w transfer") && lower.includes("sent you"))
	);
}

/** Check if a WhatsApp contact phone matches any active employee */
export async function isEmployeePhone(
	organizationId: string,
	contactPhone: string,
): Promise<boolean> {
	const normalized = normalizeLebanesPhone(contactPhone);
	if (!normalized) {
		return false;
	}

	const employees = await db.employee.findMany({
		where: { organizationId, phone: { not: null }, status: "ACTIVE" },
		select: { phone: true },
	});

	return employees.some(
		(e) => e.phone && normalizeLebanesPhone(e.phone) === normalized,
	);
}

/** Instruction prepended to the message text sent to the LLM */
export const WHISH_MONEY_CONTEXT =
	"[SYSTEM NOTE: The following message is a Whish Money payment transfer notification — NOT a customer support query. " +
	"Acknowledge briefly that the transfer notification was received and that someone from the team will review the transaction and get back to them. " +
	"Do NOT suggest contacting Whish Money support. Do NOT say this is outside your scope. Just acknowledge and reassure.]\n\n";
