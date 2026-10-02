import { beirutParts } from "@repo/utils";
import { type DbMessageRow, isMediaPlaceholder } from "../../history";

const PRIORITY_EMOJI: Record<string, string> = {
	high: "🔴",
	medium: "🟡",
	low: "🟢",
};

const PRIORITY_LABEL: Record<string, string> = {
	high: "URGENT",
	medium: "MEDIUM",
	low: "LOW",
};

const DAY_MS = 24 * 60 * 60_000;

export type EscalationSource =
	| "bot"
	| "safety-net"
	| "unknown-contact"
	| "teammate-wait";

const SOURCE_LABEL: Record<EscalationSource, string> = {
	bot: "raised by the bot",
	"safety-net": "safety net (the bot did not escalate itself)",
	"unknown-contact": "unknown-contact rule",
	"teammate-wait": "teammate did not reply",
};

/** Who filed the escalation, from the tool call id its caller used. */
export function escalationSourceFromToolCallId(
	toolCallId: string | undefined,
): EscalationSource {
	if (toolCallId?.startsWith("unknown-")) {
		return "unknown-contact";
	}
	if (toolCallId?.startsWith("guard-")) {
		return "safety-net";
	}
	if (toolCallId?.startsWith("awaiting-")) {
		return "teammate-wait";
	}
	return "bot";
}

export interface CustomerDetails {
	fullName: string | null;
	phone: string | null;
	email: string | null;
	username: string | null;
	address: string | null;
	accountNumber: string;
	status: string;
	planName: string | null;
	stationName: string | null;
}

export interface IspCustomerInfo {
	userName: string | null;
	fullName: string | null;
	address: string | null;
	online: boolean | null;
	active: boolean | null;
	blocked: boolean | null;
	stationName: string | null;
	accountTypeName: string | null;
}

export interface EscalationMessageInput {
	priority: string;
	category: string;
	/** Shown in the header: one admin chat can serve several organizations. */
	organizationName?: string | null | undefined;
	reason: string;
	source: EscalationSource;
	displayName: string;
	customer: CustomerDetails | null;
	/**
	 * How `customer` was found: `verified` = the conversation is linked to it;
	 * `phone` = the chat phone matches exactly one customer on file, but the
	 * conversation is not verified.
	 */
	customerMatch: "verified" | "phone" | null;
	ispCustomer: IspCustomerInfo | null;
	customerUsername: string | undefined;
	contactPhone: string | null;
	summary: string;
	actionRequired: string | undefined;
	/** History rows the escalation is about (chronological, with createdAt). */
	rows: DbMessageRow[];
	conversationId: string;
	/** Dashboard link to the conversation; null falls back to the raw id. */
	conversationUrl: string | null;
	now: Date;
}

export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function identityNote(input: EscalationMessageInput): string | null {
	if (input.customer && input.customerMatch === "phone") {
		return `phone match, not verified · local ${input.customer.status}`;
	}
	if (!input.customer && input.ispCustomer) {
		return "phone match in iRadius, not verified";
	}
	if (!input.customer) {
		return "not identified";
	}
	return null;
}

export function buildEscalationMessage(input: EscalationMessageInput): string {
	const emoji = PRIORITY_EMOJI[input.priority] ?? "⚪";
	const priorityLabel =
		PRIORITY_LABEL[input.priority] ?? input.priority.toUpperCase();
	const categoryLabel =
		input.category.charAt(0).toUpperCase() + input.category.slice(1);

	const lines: string[] = [
		`${emoji} <b>${priorityLabel}</b> — ${escapeHtml(categoryLabel)}${input.organizationName ? ` · ${escapeHtml(input.organizationName)}` : ""}`,
		`❓ <b>Why:</b> ${escapeHtml(input.reason)} · <i>${SOURCE_LABEL[input.source]}</i>`,
		"",
	];

	// Identity — merge DB customer, ISP lookup, and agent-provided data
	const nameParts: string[] = [escapeHtml(input.displayName)];
	const username =
		input.customer?.username ??
		input.ispCustomer?.userName ??
		input.customerUsername;
	if (username) {
		nameParts.push(`· <code>${escapeHtml(username)}</code>`);
	}
	const note = identityNote(input);
	if (note) {
		nameParts.push(`<i>(${escapeHtml(note)})</i>`);
	}
	lines.push(`👤 ${nameParts.join(" ")}`);

	const phone = input.customer?.phone ?? input.contactPhone;
	const address = input.customer?.address ?? input.ispCustomer?.address;
	const contactParts: string[] = [];
	if (phone) {
		contactParts.push(escapeHtml(phone));
	}
	if (address) {
		contactParts.push(escapeHtml(address));
	}
	if (contactParts.length > 0) {
		lines.push(`📞 ${contactParts.join(" · ")}`);
	}

	const planParts: string[] = [];
	if (input.customer?.planName) {
		planParts.push(escapeHtml(input.customer.planName));
	} else if (input.ispCustomer?.accountTypeName) {
		planParts.push(escapeHtml(input.ispCustomer.accountTypeName));
	}
	if (input.customer) {
		planParts.push(escapeHtml(input.customer.status));
	} else if (input.ispCustomer) {
		if (input.ispCustomer.blocked) {
			planParts.push("BLOCKED");
		} else if (input.ispCustomer.active === false) {
			planParts.push("INACTIVE");
		} else if (input.ispCustomer.online) {
			planParts.push("Online");
		} else if (input.ispCustomer.online === false) {
			planParts.push("Offline");
		}
	}
	const stationName =
		input.customer?.stationName ?? input.ispCustomer?.stationName;
	if (stationName) {
		planParts.push(escapeHtml(stationName));
	}
	if (planParts.length > 0) {
		lines.push(`📋 ${planParts.join(" · ")}`);
	}

	lines.push("", escapeHtml(input.summary));

	if (input.actionRequired) {
		lines.push("", `⚡ <b>Action:</b> ${escapeHtml(input.actionRequired)}`);
	}

	const lastCustomerAt = [...input.rows]
		.reverse()
		.find((row) => row.role === "user")?.createdAt;
	const excerpt = buildConversationExcerpt(input.rows, input.now);
	if (lastCustomerAt || excerpt) {
		lines.push("");
	}
	if (lastCustomerAt) {
		lines.push(
			`🕒 Last customer message: ${formatAgo(input.now.getTime() - lastCustomerAt.getTime())}`,
		);
	}
	if (excerpt) {
		lines.push(`<blockquote>${escapeHtml(excerpt)}</blockquote>`);
	}

	lines.push(
		"",
		input.conversationUrl
			? `🔗 <a href="${escapeHtml(input.conversationUrl)}">Open conversation</a>`
			: `<code>${escapeHtml(input.conversationId)}</code>`,
	);

	return lines.join("\n");
}

const ROLE_LABEL: Record<string, string> = {
	user: "👤 Customer",
	assistant: "🤖 Bot",
	admin: "🧑‍💼 Team",
};

const MEDIA_TAG: Record<string, string> = {
	audio: "[voice]",
	voice: "[voice]",
	image: "[image]",
	video: "[video]",
	document: "[document]",
	sticker: "[sticker]",
	location: "[location]",
	contact: "[contact]",
};

/** Provider placeholders stored as the text of a media message. */
const RECEIVED_PLACEHOLDER_RE = /^\s*\[[\w ]+ received\]\s*$/i;

function excerptText(row: DbMessageRow): string {
	const content = row.content.replace(/\s+/g, " ").trim();
	const placeholder =
		RECEIVED_PLACEHOLDER_RE.test(content) ||
		(row.attachmentType ? isMediaPlaceholder(content) : false);
	const text = placeholder ? "" : content;
	const tag = row.attachmentType
		? (MEDIA_TAG[row.attachmentType] ?? `[${row.attachmentType}]`)
		: "";
	return [tag, text].filter(Boolean).join(" ");
}

function formatExcerptTime(at: Date, now: Date): string {
	const a = beirutParts(at);
	const b = beirutParts(now);
	const pad = (n: number) => String(n).padStart(2, "0");
	const time = `${pad(a.hour)}:${pad(a.minute)}`;
	return a.year === b.year && a.month === b.month && a.day === b.day
		? time
		: `${pad(a.day)}/${pad(a.month)} ${time}`;
}

/**
 * The newest messages that fit the budget, shown oldest-first. Built from
 * the newest backwards so the message that triggered the escalation is never
 * the one cut. Times are Beirut; a day or more of silence between two shown
 * messages gets a separator.
 */
export function buildConversationExcerpt(
	rows: DbMessageRow[],
	now: Date,
	maxChars = 900,
	maxLines = 8,
): string {
	const lines: string[] = [];
	let total = 0;
	let newer: DbMessageRow | null = null;
	let shown = 0;

	for (let i = rows.length - 1; i >= 0 && shown < maxLines; i--) {
		const row = rows[i];
		const label = row ? ROLE_LABEL[row.role] : undefined;
		if (!row || !label) {
			continue;
		}
		const text = excerptText(row);
		if (!text) {
			continue;
		}
		const time = row.createdAt
			? ` ${formatExcerptTime(row.createdAt, now)}`
			: "";
		const clipped = text.length > 160 ? `${text.slice(0, 159)}…` : text;
		const line = `${label}${time}: ${clipped}`;

		let separator: string | null = null;
		const gapMs =
			newer?.createdAt && row.createdAt
				? newer.createdAt.getTime() - row.createdAt.getTime()
				: 0;
		if (gapMs >= DAY_MS) {
			const days = Math.floor(gapMs / DAY_MS);
			separator = `— ${days} day${days > 1 ? "s" : ""} earlier —`;
		}

		const cost = line.length + (separator?.length ?? 0);
		if (shown > 0 && total + cost > maxChars) {
			break;
		}
		if (separator) {
			lines.push(separator);
		}
		lines.push(line);
		total += cost;
		shown++;
		newer = row;
	}

	return lines.reverse().join("\n");
}

function formatAgo(ms: number): string {
	const minutes = Math.floor(ms / 60_000);
	if (minutes < 1) {
		return "just now";
	}
	if (minutes < 60) {
		return `${minutes} min ago`;
	}
	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		return `${hours} h ago`;
	}
	const days = Math.floor(hours / 24);
	return `${days} day${days > 1 ? "s" : ""} ago`;
}
