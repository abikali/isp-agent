import { customerWhatsAppPhone, db, Prisma } from "@repo/database";
import { logger } from "@repo/logs";
import { normalizeArea, normalizePhone, parsePhone } from "@repo/utils";

/**
 * Fiber control room signal sweep. Turns things customers say and do into
 * fiber leads, so nobody has to read every chat to find them:
 *
 * - a customer writes about fiber / Ogero to the bot     → lead (BOT)
 * - a stop whose category / note names Ogero or fiber    → lead (CHURN)
 * - a post-stop reply "switched provider"                → lead (CHURN, LOST)
 * - an AI escalation about fiber                          → lead (ESCALATION)
 *
 * Idempotent: every signal is an activity row with a unique `ref`, and leads
 * are keyed on (org, customer) or (org, conversation). The scheduled job runs
 * it over a short window; the control room's Rescan runs it over days.
 */

// Spellings seen in prod chats/notes (Arabic, English, Arabizi). Postgres
// `~*` regex — plain alternation, no \b (it doesn't work with Arabic).
const FIBER_TERMS = [
	// "non-fiber internet" is the opposite of interest.
	"(?<!non[- ])fib(er|re)",
	"fayber",
	"faiber",
	"fyber",
	"ftth",
	"فايبر",
	"فايبير",
	"فيبر",
	"ألياف",
	"الياف",
];
const OGERO_TERMS = [
	"ogero",
	"ojero",
	"oujero",
	"ogeru",
	"أوجيرو",
	"اوجيرو",
	"أجيرو",
	"اجيرو",
	"وجيرو",
];
export const FIBER_PATTERN = FIBER_TERMS.join("|");
export const OGERO_PATTERN = OGERO_TERMS.join("|");
const ANY_PATTERN = `${FIBER_PATTERN}|${OGERO_PATTERN}`;

const OGERO_RE = new RegExp(OGERO_PATTERN, "i");

export function mentionsOgero(text: string | null | undefined): boolean {
	return !!text && OGERO_RE.test(text);
}

export interface FiberSweepResult {
	leadsCreated: number;
	signalsAdded: number;
}

interface LeadSeed {
	organizationId: string;
	customerId: string | null;
	conversationId: string | null;
	source: string;
	/** Applied only when the lead is new (or reopened). */
	stage?: "NEW" | "LOST";
	lostReason?: string;
	contactName?: string | null;
	chatId?: string | null;
	taskId?: string | null;
}

interface Signal {
	ref: string;
	body: string;
	at: Date;
}

const CLOSED = new Set(["WON", "LOST"]);

/** Chat ids look like "96171123456@s.whatsapp.net"; "@lid" ids aren't phones. */
function phoneFromChatId(chatId: string | null | undefined): string | null {
	if (!chatId || chatId.includes("@lid")) {
		return null;
	}
	const digits = chatId.split("@")[0]?.replace(/\D/g, "") ?? "";
	return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

function quote(text: string, max = 280): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

async function findLead(seed: LeadSeed) {
	if (seed.customerId) {
		const byCustomer = await db.fiberLead.findUnique({
			where: {
				organizationId_customerId: {
					organizationId: seed.organizationId,
					customerId: seed.customerId,
				},
			},
		});
		if (byCustomer) {
			return byCustomer;
		}
	}
	if (seed.conversationId) {
		const byConversation = await db.fiberLead.findUnique({
			where: {
				organizationId_conversationId: {
					organizationId: seed.organizationId,
					conversationId: seed.conversationId,
				},
			},
		});
		if (byConversation) {
			return byConversation;
		}
	}
	// Outside contacts (broadcast replies from a CSV list) have neither key:
	// match on the phone so each reply doesn't open another lead.
	const phone = phoneFromChatId(seed.chatId);
	if (!seed.customerId && phone) {
		return db.fiberLead.findFirst({
			where: { organizationId: seed.organizationId, phone },
			orderBy: { createdAt: "asc" },
		});
	}
	return null;
}

/** Customer columns a lead copies — shared with the API's create paths. */
export const LEAD_CUSTOMER_SELECT = {
	firstName: true,
	lastName: true,
	mobile: true,
	phone: true,
	phones: true,
	groupName: true,
} as const;

/** A lead's name / phone / area from its customer (phone never a landline). */
export function leadFieldsFromCustomer(customer: {
	firstName: string | null;
	lastName: string | null;
	mobile: string | null;
	phone: string | null;
	phones: unknown;
	groupName: string | null;
}): { name: string | null; phone: string | null; area: string | null } {
	const phone = customerWhatsAppPhone(customer);
	return {
		name:
			[customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
			null,
		phone: phone ? normalizePhone(phone) : null,
		area: normalizeArea(customer.groupName),
	};
}

async function createLead(seed: LeadSeed) {
	const customer = seed.customerId
		? await db.customer.findUnique({
				where: { id: seed.customerId },
				select: LEAD_CUSTOMER_SELECT,
			})
		: null;
	const fields = customer ? leadFieldsFromCustomer(customer) : null;
	const name = fields?.name || seed.contactName || null;
	const phone = fields?.phone ?? phoneFromChatId(seed.chatId);
	const stage = seed.stage ?? "NEW";
	try {
		return await db.fiberLead.create({
			data: {
				organizationId: seed.organizationId,
				customerId: seed.customerId,
				conversationId: seed.conversationId,
				taskId: seed.taskId ?? null,
				name,
				phone,
				area: fields?.area ?? null,
				source: seed.source,
				stage,
				lostReason:
					stage === "LOST" ? (seed.lostReason ?? "OTHER") : null,
				lostAt: stage === "LOST" ? new Date() : null,
			},
		});
	} catch (error) {
		// Raced with another sweep (cron vs Rescan) — the row exists now.
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === "P2002"
		) {
			const existing = await findLead(seed);
			if (existing) {
				return existing;
			}
		}
		throw error;
	}
}

/**
 * Attach one signal to the customer's / chat's lead, creating the lead when
 * there is none. Returns what changed so the sweep can count.
 */
async function recordSignal(
	seed: LeadSeed,
	signal: Signal,
): Promise<{ created: boolean; added: boolean }> {
	let lead = await findLead(seed);
	const created = !lead;
	if (!lead) {
		lead = await createLead(seed);
	}

	// (leadId, ref) is unique: an already-recorded signal inserts nothing.
	const { count } = await db.fiberLeadActivity.createMany({
		data: [
			{
				leadId: lead.id,
				type: "SIGNAL",
				body: signal.body,
				ref: signal.ref,
				createdAt: signal.at,
			},
		],
		skipDuplicates: true,
	});
	if (count === 0) {
		return { created, added: false };
	}

	// Stage: someone we lost is talking about fiber again → back in play; a
	// fresh LOST signal closes an open lead. Only signals newer than the
	// lead's last change count, so a backfilled old signal never overrides
	// what staff decided since.
	const fresh = !created && signal.at > lead.updatedAt;
	const reopen = fresh && lead.stage === "LOST" && seed.stage !== "LOST";
	const close = fresh && seed.stage === "LOST" && !CLOSED.has(lead.stage);
	if (reopen || close) {
		await db.fiberLead.update({
			where: { id: lead.id },
			data: {
				stage: reopen ? "NEW" : "LOST",
				lostReason: reopen ? null : (seed.lostReason ?? "OTHER"),
				lostAt: reopen ? null : new Date(),
				activities: {
					create: {
						type: "STAGE",
						fromStage: lead.stage,
						toStage: reopen ? "NEW" : "LOST",
						body: reopen
							? "Reopened — new fiber signal"
							: "Closed by signal",
					},
				},
			},
		});
	}

	// Fill in links the lead didn't have. Separate from the stage write: a
	// conversation/customer already owned by another lead must not cost the
	// stage change.
	const links: Record<string, string> = {};
	if (seed.customerId && !lead.customerId) {
		links["customerId"] = seed.customerId;
	}
	if (seed.conversationId && !lead.conversationId) {
		links["conversationId"] = seed.conversationId;
	}
	if (seed.taskId && !lead.taskId) {
		links["taskId"] = seed.taskId;
	}
	if (Object.keys(links).length > 0) {
		await db.fiberLead
			.update({ where: { id: lead.id }, data: links })
			.catch((error) => {
				logger.warn("fiber-lead-link-skipped", {
					leadId: lead.id,
					error: String(error),
				});
			});
	}
	return { created, added: true };
}

interface MessageRow {
	id: string;
	conversationId: string;
	content: string;
	createdAt: Date;
	organizationId: string;
	verifiedCustomerId: string | null;
	contactName: string | null;
	externalChatId: string;
}

interface PaymentRow {
	id: string;
	organizationId: string;
	customerId: string;
	notes: string | null;
	noteCategory: string | null;
	createdAt: Date;
}

interface TaskRow {
	id: string;
	organizationId: string;
	customerId: string | null;
	conversationId: string | null;
	title: string;
	description: string | null;
	createdAt: Date;
}

/**
 * Scan everything since `since` (optionally one org) and record signals.
 */
export async function runFiberSignalSweep(opts: {
	since: Date;
	organizationId?: string;
}): Promise<FiberSweepResult> {
	const orgFilter = opts.organizationId
		? Prisma.sql`AND a."organizationId" = ${opts.organizationId}`
		: Prisma.empty;
	// Collected from every source, then applied oldest first, so the newest
	// signal decides the stage (a renewed interest after a stop reopens).
	const pending: Array<[LeadSeed, Signal]> = [];

	// 1. Customers writing to the bot about fiber / Ogero.
	const messages = await db.$queryRaw<MessageRow[]>`
		SELECT m.id, m."conversationId", m.content, m."createdAt",
		       a."organizationId", c."verifiedCustomerId", c."contactName",
		       c."externalChatId"
		FROM ai_message m
		JOIN ai_conversation c ON c.id = m."conversationId"
		JOIN ai_agent a ON a.id = c."agentId"
		WHERE m.role = 'user'
		  AND m."createdAt" >= ${opts.since}
		  AND m.content ~* ${ANY_PATTERN}
		  ${orgFilter}
		ORDER BY m."createdAt" ASC`;
	for (const m of messages) {
		pending.push([
			{
				organizationId: m.organizationId,
				customerId: m.verifiedCustomerId,
				conversationId: m.conversationId,
				source: "BOT",
				contactName: m.contactName,
				chatId: m.externalChatId,
			},
			{
				ref: `msg:${m.id}`,
				body: `${mentionsOgero(m.content) ? "Mentioned Ogero" : "Asked about fiber"}: “${quote(m.content)}”`,
				at: m.createdAt,
			},
		]);
	}

	// 2. Stops that name Ogero (lost) or ask for fiber (still winnable).
	const paymentOrg = opts.organizationId
		? Prisma.sql`AND p."organizationId" = ${opts.organizationId}`
		: Prisma.empty;
	const stops = await db.$queryRaw<PaymentRow[]>`
		SELECT p.id, p."organizationId", p."customerId", p.notes,
		       p."noteCategory", p."createdAt"
		FROM payment p
		WHERE p."stoppedAccount" = true
		  AND p."createdAt" >= ${opts.since}
		  AND (COALESCE(p.notes, '') ~* ${ANY_PATTERN}
		       OR COALESCE(p."noteCategory", '') ~* ${ANY_PATTERN})
		  ${paymentOrg}`;
	for (const p of stops) {
		const text = `${p.noteCategory ?? ""} ${p.notes ?? ""}`;
		const toOgero = mentionsOgero(text);
		pending.push([
			{
				organizationId: p.organizationId,
				customerId: p.customerId,
				conversationId: null,
				source: "CHURN",
				stage: toOgero ? "LOST" : "NEW",
				lostReason: "OGERO",
			},
			{
				ref: `pay:${p.id}`,
				body: `${toOgero ? "Stopped — took Ogero" : "Stopped — wants fiber"}: “${quote(text)}”`,
				at: p.createdAt,
			},
		]);
	}

	// 3. Post-stop outreach answered "I switched provider".
	const switched = await db.botFollowUp.findMany({
		where: {
			outcome: "switched_provider",
			customerId: { not: null },
			replyAt: { gte: opts.since },
			...(opts.organizationId
				? { organizationId: opts.organizationId }
				: {}),
		},
		select: {
			id: true,
			organizationId: true,
			customerId: true,
			reply: true,
			replyAt: true,
		},
	});
	for (const f of switched) {
		if (!f.customerId) {
			continue;
		}
		const toOgero = mentionsOgero(f.reply);
		pending.push([
			{
				organizationId: f.organizationId,
				customerId: f.customerId,
				conversationId: null,
				source: "CHURN",
				stage: "LOST",
				lostReason: toOgero ? "OGERO" : "OTHER_ISP",
			},
			{
				ref: `followup:${f.id}`,
				body: `Said they switched provider${f.reply ? `: “${quote(f.reply)}”` : ""}`,
				at: f.replyAt ?? new Date(),
			},
		]);
	}

	// 4. Bot escalations about fiber (installation requests, box photos…).
	const taskOrg = opts.organizationId
		? Prisma.sql`AND t."organizationId" = ${opts.organizationId}`
		: Prisma.empty;
	const tasks = await db.$queryRaw<TaskRow[]>`
		SELECT t.id, t."organizationId", t."customerId", t."conversationId",
		       t.title, t.description, t."createdAt"
		FROM task t
		WHERE t.source = 'AI_ESCALATION'
		  AND t."createdAt" >= ${opts.since}
		  AND (t.title ~* ${ANY_PATTERN}
		       OR COALESCE(t.description, '') ~* ${ANY_PATTERN})
		  ${taskOrg}`;
	for (const t of tasks) {
		if (!t.customerId && !t.conversationId) {
			continue;
		}
		pending.push([
			{
				organizationId: t.organizationId,
				customerId: t.customerId,
				conversationId: t.conversationId,
				source: "ESCALATION",
				taskId: t.id,
			},
			{
				ref: `task:${t.id}`,
				body: `Bot escalated: ${quote(t.title, 160)}`,
				at: t.createdAt,
			},
		]);
	}

	// Refs are globally unique (msg:/pay:/task:… ids), so one query drops
	// everything earlier runs already recorded — the cron window overlaps.
	const known = new Set(
		(
			await db.fiberLeadActivity.findMany({
				where: { ref: { in: pending.map(([, sig]) => sig.ref) } },
				select: { ref: true },
			})
		).map((a) => a.ref),
	);
	const todo = pending.filter(([, sig]) => !known.has(sig.ref));
	todo.sort((x, y) => x[1].at.getTime() - y[1].at.getTime());
	const result: FiberSweepResult = { leadsCreated: 0, signalsAdded: 0 };
	for (const [seed, signal] of todo) {
		const r = await recordSignal(seed, signal);
		result.leadsCreated += r.created ? 1 : 0;
		result.signalsAdded += r.added ? 1 : 0;
	}

	if (result.leadsCreated > 0 || result.signalsAdded > 0) {
		logger.info("fiber-signal-sweep", {
			since: opts.since.toISOString(),
			organizationId: opts.organizationId,
			...result,
		});
	}
	return result;
}

const FIBER_OR_OGERO_RE = new RegExp(ANY_PATTERN, "i");

/** Short stable key for a message text (djb2). */
function textKey(text: string): string {
	let h = 5381;
	for (let i = 0; i < text.length; i++) {
		h = ((h << 5) + h + text.charCodeAt(i)) | 0;
	}
	return (h >>> 0).toString(36);
}
const BROADCAST_REPLY_WINDOW_MS = 14 * 86_400_000;

/**
 * A customer answered a broadcast on the official (Salti) number. Replies
 * never reach the bot, so without this they sit unread in the Salti inbox.
 * A reply to a fiber broadcast — or any reply that talks about fiber/Ogero —
 * opens (or feeds) a fiber lead attributed to that broadcast, and every
 * later reply from that recipient is added to its timeline. Returns true
 * when it recorded something.
 */
export async function recordBroadcastReply(message: {
	phone: string;
	text: string;
}): Promise<boolean> {
	const phone =
		parsePhone(message.phone)?.digits ?? message.phone.replace(/\D/g, "");
	if (!phone) {
		return false;
	}
	const recipient = await db.marketingBroadcastRecipient.findFirst({
		where: {
			phone,
			status: "sent",
			sentAt: { gte: new Date(Date.now() - BROADCAST_REPLY_WINDOW_MS) },
		},
		orderBy: { sentAt: "desc" },
		select: {
			id: true,
			customerId: true,
			contactName: true,
			broadcast: {
				select: {
					organizationId: true,
					name: true,
					templateName: true,
				},
			},
		},
	});
	if (!recipient) {
		return false;
	}
	// Template names are fixed once Meta approves them (fiber_box_offer…);
	// the broadcast's own name is free text and can say anything.
	const fiberBroadcast = FIBER_OR_OGERO_RE.test(
		recipient.broadcast.templateName,
	);
	if (!fiberBroadcast && !FIBER_OR_OGERO_RE.test(message.text)) {
		return false;
	}
	const { added } = await recordSignal(
		{
			organizationId: recipient.broadcast.organizationId,
			customerId: recipient.customerId,
			conversationId: null,
			source: "BROADCAST",
			contactName: recipient.contactName,
			chatId: phone,
		},
		{
			// Webhook messages carry no id: key on the text so a redelivery is
			// a no-op but every distinct reply lands on the timeline.
			ref: `bcast:${recipient.id}:${textKey(message.text)}`,
			body: `Replied to “${recipient.broadcast.name}”${message.text ? `: “${quote(message.text)}”` : ""}`,
			at: new Date(),
		},
	);
	return added;
}
