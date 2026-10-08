import {
	classifyFiberInterest,
	type ModelCredentials,
	resolveAgentCredentials,
} from "@repo/ai";
import { customerWhatsAppPhone, db, Prisma } from "@repo/database";
import { logger } from "@repo/logs";
import { normalizeArea, normalizePhone, parsePhone } from "@repo/utils";
import { getRedisConnection } from "../connection";

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
const FIBER_OR_OGERO_RE = new RegExp(ANY_PATTERN, "i");

const MESSAGE_KIND = "Customer WhatsApp message to the ISP's support bot";
const TICKET_KIND = "Support bot escalation ticket";
/** Refs the classifier said are not fiber requests — never asked again. */
const REJECTED_KEY = "fiber:signals:rejected";
const REJECTED_TTL_SECONDS = 180 * 86_400;
const CLASSIFY_CONCURRENCY = 6;

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
	/**
	 * Free text that only matched a keyword (a chat message, a bot ticket):
	 * the classifier must agree it is a fiber request before it becomes a
	 * lead. Collector stop notes are explicit and skip this.
	 */
	verify?: { kind: string; text: string };
	/** One sentence on why this puts the person in the pipeline. */
	summary?: string;
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

	if (signal.summary) {
		await db.fiberLead.update({
			where: { id: lead.id },
			data: { summary: signal.summary },
		});
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

/** The whole text, not a snippet — admins read it to see why a lead exists. */
function fullText(text: string): string {
	return text.trim().slice(0, 6000);
}

/**
 * What an admin reads for a bot ticket. The title is just the first words
 * of the description, so showing both repeats the opening.
 */
function ticketBody(t: { title: string; description: string | null }): string {
	return fullText(t.description?.trim() || t.title);
}

function ticketText(t: { title: string; description: string | null }): string {
	return `${t.title}\n${t.description ?? ""}`;
}

/** The org's AI key (any agent that has one), cached per sweep. */
function credentialsLoader() {
	const cache = new Map<string, Promise<ModelCredentials | null>>();
	return (organizationId: string) => {
		let found = cache.get(organizationId);
		if (!found) {
			found = db.aiAgent
				.findFirst({
					where: { organizationId, encryptedApiKey: { not: null } },
					orderBy: { createdAt: "asc" },
					select: { provider: true, encryptedApiKey: true },
				})
				.then((agent) =>
					agent ? resolveAgentCredentials(agent) : null,
				)
				.catch(() => null);
			cache.set(organizationId, found);
		}
		return found;
	};
}

/**
 * true = a fiber request, false = not one (remembered), null = could not
 * tell right now (no key, model error) — left for the next run.
 */
async function checkFiberRequest(
	organizationId: string,
	ref: string,
	verify: { kind: string; text: string },
	credentialsFor: (
		organizationId: string,
	) => Promise<ModelCredentials | null>,
	/** false = dry run: don't record a rejection. */
	remember = true,
): Promise<{ fiberRequest: boolean; summary: string } | null> {
	const redis = getRedisConnection();
	if (await redis.sismember(REJECTED_KEY, ref)) {
		return { fiberRequest: false, summary: "" };
	}
	const credentials = await credentialsFor(organizationId);
	if (!credentials) {
		return null;
	}
	const verdict = await classifyFiberInterest({ credentials, ...verify });
	if (!verdict) {
		return null;
	}
	if (!verdict.fiberRequest && remember) {
		await redis.sadd(REJECTED_KEY, ref);
		await redis.expire(REJECTED_KEY, REJECTED_TTL_SECONDS);
	}
	return verdict;
}

/**
 * Drop keyword matches the classifier says are not fiber requests, and
 * attach its one-line reason to the ones that are.
 */
async function keepFiberRequests(
	items: Array<[LeadSeed, Signal]>,
): Promise<Array<[LeadSeed, Signal]>> {
	const credentialsFor = credentialsLoader();
	const kept: Array<[LeadSeed, Signal]> = [];
	for (let i = 0; i < items.length; i += CLASSIFY_CONCURRENCY) {
		const chunk = items.slice(i, i + CLASSIFY_CONCURRENCY);
		const verdicts = await Promise.all(
			chunk.map(([seed, signal]) =>
				signal.verify
					? checkFiberRequest(
							seed.organizationId,
							signal.ref,
							signal.verify,
							credentialsFor,
						)
					: null,
			),
		);
		chunk.forEach(([seed, signal], j) => {
			const verdict = verdicts[j];
			if (!signal.verify) {
				kept.push([seed, signal]);
			} else if (verdict?.fiberRequest) {
				kept.push([seed, { ...signal, summary: verdict.summary }]);
			}
		});
	}
	return kept;
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
				body: fullText(m.content),
				at: m.createdAt,
				verify: { kind: MESSAGE_KIND, text: m.content },
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
				body: fullText(text),
				summary: toOgero
					? "Stopped the service — the collector noted they took Ogero."
					: "Stopped the service — the collector noted they want fiber.",
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
		// "Switched provider" alone says nothing about fiber — only replies
		// that name fiber or Ogero belong in this room.
		if (!f.customerId || !f.reply || !FIBER_OR_OGERO_RE.test(f.reply)) {
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
				body: fullText(f.reply),
				summary: toOgero
					? "After stopping, said they switched to Ogero."
					: "After stopping, said they switched provider and mentioned fiber.",
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
				body: ticketBody(t),
				at: t.createdAt,
				verify: { kind: TICKET_KIND, text: ticketText(t) },
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
	const todo = await keepFiberRequests(
		pending.filter(([, sig]) => !known.has(sig.ref)),
	);
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
	// "How much?" is a lead; "stop sending me this" is not. If the model
	// can't be reached, an answer to a fiber ad still counts.
	const verdict = await checkFiberRequest(
		recipient.broadcast.organizationId,
		`bcast:${recipient.id}:${textKey(message.text)}`,
		{
			kind: fiberBroadcast
				? "Customer's reply to LibanCom's fiber-offer WhatsApp broadcast"
				: MESSAGE_KIND,
			text: message.text,
		},
		credentialsLoader(),
	);
	if (verdict ? !verdict.fiberRequest : !fiberBroadcast) {
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
			body: fullText(message.text),
			summary:
				verdict?.summary ||
				`Replied to our “${recipient.broadcast.name}” broadcast.`,
			at: new Date(),
		},
	);
	return added;
}

/**
 * Re-check leads that came in from chats / tickets and nobody has worked
 * yet: signals the classifier rejects are removed, and a lead left with no
 * signal is deleted. For cleaning up after the keyword-only sweep.
 */
export async function pruneNonFiberLeads(
	opts: { organizationId?: string; dryRun?: boolean } = {},
): Promise<{
	leadsRemoved: number;
	signalsRemoved: number;
	/** What would be / was deleted, for review. */
	removed: string[];
}> {
	const leads = await db.fiberLead.findMany({
		where: {
			stage: "NEW",
			source: { in: ["BOT", "ESCALATION"] },
			...(opts.organizationId
				? { organizationId: opts.organizationId }
				: {}),
			// Untouched: nothing but automatic signals on the timeline.
			activities: { every: { type: "SIGNAL" } },
		},
		select: {
			id: true,
			name: true,
			organizationId: true,
			activities: { select: { id: true, ref: true, body: true } },
		},
	});
	const removed: string[] = [];
	const credentialsFor = credentialsLoader();
	let leadsRemoved = 0;
	let signalsRemoved = 0;
	for (const lead of leads) {
		let remaining = lead.activities.length;
		for (const activity of lead.activities) {
			const [kind, id] = (activity.ref ?? "").split(":");
			let verify: { kind: string; text: string } | null = null;
			if (kind === "msg" && id) {
				const message = await db.aiMessage.findUnique({
					where: { id },
					select: { content: true },
				});
				verify = message
					? { kind: MESSAGE_KIND, text: message.content }
					: null;
			} else if (kind === "task" && id) {
				const task = await db.task.findUnique({
					where: { id },
					select: { title: true, description: true },
				});
				verify = task
					? { kind: TICKET_KIND, text: ticketText(task) }
					: null;
			}
			if (!verify || !activity.ref) {
				continue;
			}
			const verdict = await checkFiberRequest(
				lead.organizationId,
				activity.ref,
				verify,
				credentialsFor,
				!opts.dryRun,
			);
			if (verdict && !verdict.fiberRequest) {
				removed.push(
					`${lead.name ?? "?"} — ${quote(activity.body ?? "", 110)}`,
				);
				if (!opts.dryRun) {
					await db.fiberLeadActivity.delete({
						where: { id: activity.id },
					});
				}
				signalsRemoved += 1;
				remaining -= 1;
			}
		}
		if (remaining === 0) {
			if (!opts.dryRun) {
				await db.fiberLead.delete({ where: { id: lead.id } });
			}
			leadsRemoved += 1;
		}
	}
	logger.info("fiber-lead-prune", { ...opts, leadsRemoved, signalsRemoved });
	return { leadsRemoved, signalsRemoved, removed };
}

/**
 * Bring existing leads up to the "says why" standard: put the full original
 * text on each chat / ticket signal (older rows hold a cropped quote) and
 * write the lead's one-line summary from its most recent signal. One-off
 * after deploy; safe to re-run.
 */
export async function refreshFiberLeadReasons(
	opts: { organizationId?: string } = {},
): Promise<{ leads: number; summarised: number }> {
	const leads = await db.fiberLead.findMany({
		where: opts.organizationId
			? { organizationId: opts.organizationId }
			: {},
		select: {
			id: true,
			organizationId: true,
			source: true,
			summary: true,
			notes: true,
			activities: {
				where: { type: "SIGNAL" },
				orderBy: { createdAt: "desc" },
				select: { id: true, ref: true, body: true },
			},
		},
	});
	const credentialsFor = credentialsLoader();
	let summarised = 0;
	for (const lead of leads) {
		let summary: string | null = null;
		for (const activity of lead.activities) {
			const [kind, id] = (activity.ref ?? "").split(":");
			let source: { kind: string; text: string } | null = null;
			let body: string | null = null;
			if (kind === "msg" && id) {
				const message = await db.aiMessage.findUnique({
					where: { id },
					select: { content: true },
				});
				if (message) {
					source = { kind: MESSAGE_KIND, text: message.content };
					body = fullText(message.content);
				}
			} else if (kind === "task" && id) {
				const task = await db.task.findUnique({
					where: { id },
					select: { title: true, description: true },
				});
				if (task) {
					source = { kind: TICKET_KIND, text: ticketText(task) };
					body = ticketBody(task);
				}
			}
			if (!source || !body) {
				continue;
			}
			await db.fiberLeadActivity.update({
				where: { id: activity.id },
				data: { body },
			});
			// Newest signal first: the first one that yields a summary wins.
			if (!summary) {
				const credentials = await credentialsFor(lead.organizationId);
				const verdict = credentials
					? await classifyFiberInterest({ credentials, ...source })
					: null;
				summary = verdict?.fiberRequest ? verdict.summary : null;
			}
		}
		summary ??=
			lead.summary ??
			(lead.source === "CHURN"
				? "Stopped the service — fiber or Ogero was mentioned."
				: lead.source === "CUSTOMER_BASE"
					? "Added from the at-risk list — worth a call before Ogero reaches them."
					: lead.source === "MANUAL"
						? lead.notes || "Added by staff."
						: null);
		if (summary && summary !== lead.summary) {
			await db.fiberLead.update({
				where: { id: lead.id },
				data: { summary },
			});
			summarised += 1;
		}
	}
	logger.info("fiber-lead-reasons", {
		...opts,
		leads: leads.length,
		summarised,
	});
	return { leads: leads.length, summarised };
}
