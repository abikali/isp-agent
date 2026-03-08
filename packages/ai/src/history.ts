/**
 * Builds a context gap note to inject into message history when there's been
 * a significant time gap between messages. Returns null if no gap or below threshold.
 */
export function buildContextGapNote(
	lastMessageAt: Date | null,
	thresholdMinutes: number,
): string | null {
	if (!lastMessageAt) {
		return null;
	}

	const gapMs = Date.now() - lastMessageAt.getTime();
	const gapMinutes = gapMs / 60_000;

	if (gapMinutes < thresholdMinutes) {
		return null;
	}

	const duration = formatGapDuration(gapMs);
	return `[Context Notice: ${duration} have passed since the last message. The customer may be following up or raising a new issue. Do not assume continuity — let their message guide you.]`;
}

function formatGapDuration(ms: number): string {
	const totalMinutes = Math.floor(ms / 60_000);
	const hours = Math.floor(totalMinutes / 60);
	const days = Math.floor(hours / 24);
	const remainingHours = hours % 24;

	if (days > 0 && remainingHours > 0) {
		return `${days} day${days > 1 ? "s" : ""} and ${remainingHours} hour${remainingHours > 1 ? "s" : ""}`;
	}
	if (days > 0) {
		return `${days} day${days > 1 ? "s" : ""}`;
	}
	return `${hours} hour${hours > 1 ? "s" : ""}`;
}

/**
 * Formats a DB message row into a model-facing history message.
 *
 * For assistant messages that have `toolCalls`, a text annotation is appended
 * so the model can see which tools were already invoked (preventing duplicate
 * calls like repeated escalations).
 */
export function formatHistoryMessage(msg: {
	role: string;
	content: string;
	toolCalls?: unknown;
}): { role: "user" | "assistant"; content: string } {
	const role: "user" | "assistant" =
		msg.role === "admin" ? "assistant" : (msg.role as "user" | "assistant");

	let content = msg.content;

	if (role === "assistant" && msg.toolCalls) {
		const annotation = formatToolCallsAnnotation(msg.toolCalls);
		if (annotation) {
			content = `${content}\n\n${annotation}`;
		}
	}

	return { role, content };
}

const MAX_ARGS_LENGTH = 300;
const MAX_RESULT_LENGTH = 200;

function truncate(value: string, max: number): string {
	if (value.length <= max) {
		return value;
	}
	return `${value.slice(0, max)}...`;
}

function formatToolCallsAnnotation(toolCalls: unknown): string | null {
	if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
		return null;
	}

	const lines: string[] = [];

	for (const call of toolCalls) {
		if (!call || typeof call !== "object") {
			continue;
		}

		const name =
			typeof call.toolName === "string" ? call.toolName : "unknown";
		const args =
			call.args != null
				? truncate(stringify(call.args), MAX_ARGS_LENGTH)
				: "";
		const result =
			call.result != null
				? ` → ${truncate(stringify(call.result), MAX_RESULT_LENGTH)}`
				: "";

		lines.push(`- ${name}: ${args}${result}`);
	}

	if (lines.length === 0) {
		return null;
	}

	return `[Tools used in this response]\n${lines.join("\n")}`;
}

function stringify(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}
