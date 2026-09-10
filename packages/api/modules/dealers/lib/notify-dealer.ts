import { type ChannelProvider, decryptToken, sendTextMessage } from "@repo/ai";
import { db } from "@repo/database";
import { logger } from "@repo/logs";

/**
 * WhatsApp a dealer about money recorded on his account.
 *
 * Dealers are not employees (no Telegram, no app login), so the only channel
 * we have is the organization's WhatsApp number — the same WaSender session
 * the support agent replies from. There is no approved WPBox template for
 * dealer money, so this is a plain session message; it reaches any dealer
 * who has ever chatted with the number and most who have not.
 *
 * Best-effort by design: the ledger write already succeeded, and a dealer
 * without a phone or an org without a WhatsApp channel must not turn a
 * recorded payment into an error. The caller gets `sent` so the UI can say
 * whether the dealer heard about it.
 */
export async function notifyDealerWhatsApp(input: {
	organizationId: string;
	dealerId: string;
	text: string;
}): Promise<{ sent: boolean; reason?: string }> {
	try {
		const [dealer, channel] = await Promise.all([
			db.ispDealer.findUnique({
				where: { id: input.dealerId },
				select: {
					phone: true,
					companyMobile: true,
					companyPhone: true,
				},
			}),
			db.aiAgentChannel.findFirst({
				where: {
					provider: "whatsapp",
					enabled: true,
					agent: {
						organizationId: input.organizationId,
						enabled: true,
					},
				},
				select: { encryptedApiToken: true, provider: true },
			}),
		]);
		const phone = [
			dealer?.phone,
			dealer?.companyMobile,
			dealer?.companyPhone,
		]
			.map((p) => (p ?? "").replace(/\D/g, ""))
			.find((digits) => digits.length >= 8);
		if (!phone) {
			return { sent: false, reason: "no_phone" };
		}
		if (!channel) {
			return { sent: false, reason: "no_channel" };
		}
		const chatId = `${phone.startsWith("961") || phone.length > 8 ? phone : `961${phone}`}@s.whatsapp.net`;
		const result = await sendTextMessage(
			channel.provider as ChannelProvider,
			decryptToken(channel.encryptedApiToken),
			chatId,
			input.text,
		);
		return result.success
			? { sent: true }
			: { sent: false, reason: "send_failed" };
	} catch (error) {
		logger.warn("[dealers] dealer WhatsApp notify failed", {
			dealerId: input.dealerId,
			error: String(error),
		});
		return { sent: false, reason: "error" };
	}
}

/** Money formatting shared by the two dealer messages. */
export function dealerAmount(amount: number): string {
	return `$${amount.toFixed(2)}`;
}
