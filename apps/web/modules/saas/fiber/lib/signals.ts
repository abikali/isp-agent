/**
 * A lead's "signals" are the things that put it in the pipeline: what the
 * customer wrote, the bot's ticket, a collector's stop note. The activity
 * `ref` says which ("msg:<id>", "task:<id>", "bcast:…", "pay:<id>",
 * "followup:<id>"); these helpers turn that into words.
 */
export type SignalKind = "chat" | "ticket" | "broadcast" | "stop" | "afterStop";

export function signalKind(ref: string | null | undefined): SignalKind {
	switch (ref?.split(":")[0]) {
		case "task":
			return "ticket";
		case "bcast":
			return "broadcast";
		case "pay":
			return "stop";
		case "followup":
			return "afterStop";
		default:
			return "chat";
	}
}

/** Who is speaking, shown above the quoted text. */
export const SIGNAL_LABELS: Record<SignalKind, string> = {
	chat: "The customer wrote to the bot",
	ticket: "The bot passed this to the team",
	broadcast: "The customer replied to our broadcast",
	stop: "The collector's note when stopping the service",
	afterStop: "The customer's answer after stopping",
};

/** True when the quoted text is the customer's own words (shown as a chat bubble). */
export function isCustomerVoice(kind: SignalKind): boolean {
	return kind === "chat" || kind === "broadcast" || kind === "afterStop";
}

/** Bot tickets start with a fixed prefix that says nothing. */
export function signalText(
	kind: SignalKind,
	body: string | null | undefined,
): string {
	const text = (body ?? "").trim();
	return kind === "ticket" ? text.replace(/^AI Escalation:\s*/i, "") : text;
}
