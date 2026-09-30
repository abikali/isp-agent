import { z } from "zod";
import { classifyText } from "./classify";
import { helperModelId, type ModelCredentials } from "./model-registry";

/**
 * Reading a customer's answer to a bot follow-up. Only a clear "yes, it is
 * solved" closes anything automatically; sarcasm or doubt is "unclear".
 */

export const checkBackReplySchema = z.object({
	resolved: z.enum(["yes", "no", "unclear"]),
	reason: z
		.string()
		.describe("One short English sentence explaining the verdict."),
});

export type CheckBackReply = z.infer<typeof checkBackReplySchema>;

const CHECK_BACK_SYSTEM = `An ISP's support bot escalated a customer's problem to the team, then later asked the customer whether the team reached them and whether the problem is solved. Classify the customer's answer.

- "yes": the customer clearly says the problem is solved / it works now / the team fixed it.
- "no": the customer says it is still not working, nobody contacted them, or they still need help.
- "unclear": anything else — a question, a new topic, sarcasm ("اي منيح كتير 🙄"), or not enough to tell.
The customer may write Lebanese Arabic, Arabizi, English or French. Write "reason" in English.`;

export async function classifyCheckBackReply(input: {
	credentials: ModelCredentials;
	checkBack: string;
	customerReplies: string[];
	botReply?: string | null | undefined;
}): Promise<CheckBackReply | null> {
	const replies = input.customerReplies
		.map((r) => `Customer: ${r}`)
		.join("\n");
	const bot = input.botReply ? `\nBot answered: ${input.botReply}` : "";
	return classifyText({
		systemPrompt: CHECK_BACK_SYSTEM,
		userPrompt: `Bot's check-back: ${input.checkBack}\n${replies}${bot}`,
		schema: checkBackReplySchema,
		credentials: input.credentials,
		model: helperModelId(input.credentials.provider, "mini"),
		timeoutMs: 8000,
	});
}

export const OUTREACH_OUTCOMES = [
	"good",
	"ok",
	"bad",
	"travel",
	"moved",
	"switched_provider",
	"resume",
	"other",
] as const;

export type OutreachOutcome = (typeof OUTREACH_OUTCOMES)[number];

export const outreachReplySchema = z.object({
	outcome: z.enum(OUTREACH_OUTCOMES),
	reason: z
		.string()
		.describe(
			"One short English sentence with the customer's reason, in their words' meaning.",
		),
});

export type OutreachReply = z.infer<typeof outreachReplySchema>;

const OUTREACH_SYSTEM = `An ISP (LibanCom) messaged a customer from its official WhatsApp number and the customer answered in free text. Classify the answer.

For a post-install satisfaction check: "good" (happy), "ok" (acceptable, with reservations), "bad" (a problem or unhappy).
For a message after the customer's subscription was stopped: "travel" (travelling / temporary pause), "moved" (moved house / new address), "switched_provider" (went to another company — note why: price, speed, outages, support), "resume" (wants the line back), "other" (anything else).
The customer may write Lebanese Arabic, Arabizi, English or French. Write "reason" in English.`;

export async function classifyOutreachReply(input: {
	credentials: ModelCredentials;
	type: "post_install" | "post_stop";
	sentText: string | null;
	replies: string[];
}): Promise<OutreachReply | null> {
	const kind =
		input.type === "post_install"
			? "Post-install satisfaction check"
			: "Message after the subscription was stopped";
	return classifyText({
		systemPrompt: OUTREACH_SYSTEM,
		userPrompt: `${kind}.\nWe sent: ${input.sentText ?? "(template)"}\n${input.replies
			.map((r) => `Customer: ${r}`)
			.join("\n")}`,
		schema: outreachReplySchema,
		credentials: input.credentials,
		model: helperModelId(input.credentials.provider, "mini"),
		timeoutMs: 8000,
	});
}

/**
 * "Stop messaging me" — deterministic, so an opt-out never depends on a
 * model call. Matches the whole reply, not a word inside a longer sentence
 * ("my internet stopped" is not an opt-out).
 */
const OPT_OUT_RE =
	/^(?:stop|unsubscribe|(?:la|ma) ?tb3atou ?li|(?:لا|ما) ?(?:تبعتولي|تبعتوا لي|تبعتلي)(?: بعد)?(?: رسائل)?|وقفوا الرسائل|بطلوا تبعتوا)$/;

export function isOptOutReply(text: string): boolean {
	const t = text
		.trim()
		.toLowerCase()
		.replace(/\s+/g, " ")
		.replace(/[.!؟?،,]+$/g, "");
	return OPT_OUT_RE.test(t);
}
