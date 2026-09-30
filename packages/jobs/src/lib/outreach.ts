import {
	classifyOutreachReply,
	escapeTelegramHtml,
	isOptOutReply,
	notifyTeamTelegram,
	type OutreachOutcome,
	renderOutreachContext,
	resolveAgentCredentials,
} from "@repo/ai";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import {
	appendTaskNote,
	beirutDayAt,
	beirutParts,
	formatBeirutStamp,
	getBaseUrl,
	parsePhone,
	toNationalDigits,
} from "@repo/utils";
import {
	arabicDayMonthLabel,
	fetchWPBoxConversations,
	fetchWPBoxMessages,
	quickReplyButtons,
	sanitizeTemplateParam,
	sendWPBoxMessage,
	sendWPBoxTemplate,
	type WPBoxContact,
} from "./wpbox";

/**
 * Business-initiated follow-ups on the official (Salti/WPBox) number:
 * the install satisfaction check (#14) and the day-after-a-stop message
 * (#15). Rows live in `bot_follow_up`; the sweep sends due ones, the Salti
 * webhook (and a nightly reconcile) brings the answers back.
 *
 * Everything is opt-in per agent and no-ops while the Salti template name is
 * not configured (env), so nothing goes out before Meta approves it.
 */

export type OutreachType = "post_install" | "post_stop";

interface OutreachDefinition {
	/** Env var holding the approved Salti template name. */
	templateEnv: string;
	/** Quick-reply payload choices, in button order. */
	choices: readonly string[];
	/** Button texts as created in Salti, same order (for text-only replies). */
	buttonTitles: readonly string[];
	/** The template body, rendered for the approval preview and the log. */
	body: (name: string, date: string) => string;
}

export const OUTREACH_DEFINITIONS: Record<OutreachType, OutreachDefinition> = {
	post_install: {
		templateEnv: "SALTI_TEMPLATE_INSTALL_SATISFACTION",
		choices: ["good", "ok", "bad"],
		buttonTitles: ["ممتازة", "مقبولة", "في مشكلة"],
		body: (name) =>
			`مرحباً ${name}، شكراً لاختيارك LibanCom 🙏 مرّ كم يوم على تركيب خط الإنترنت عندك، ويهمّنا نعرف رأيك: كيف الخدمة لحدّ هلّق؟`,
	},
	post_stop: {
		templateEnv: "SALTI_TEMPLATE_SERVICE_STOP_REASON",
		choices: ["travel", "moved", "switched", "resume", "other"],
		buttonTitles: [
			"مسافر / توقيف مؤقت",
			"نقلت على بيت تاني",
			"نقلت على شركة تانية",
			"بدي رجّع الخط",
			"سبب تاني",
		],
		body: (name, date) =>
			`مرحباً ${name}، لاحظنا إنو اشتراك الإنترنت تبعك مع LibanCom توقّف بتاريخ ${date}. يهمّنا نعرف السبب حتى نحسّن خدمتنا، وإذا حابب نرجّع نشغّل الخط نحنا جاهزين.`,
	},
};

/** The approved template name, or null while it is not configured. */
export function outreachTemplateName(type: OutreachType): string | null {
	return process.env[OUTREACH_DEFINITIONS[type].templateEnv]?.trim() || null;
}

/** Button payload choice → stored outcome. */
function choiceOutcome(choice: string): OutreachOutcome | null {
	const map: Record<string, OutreachOutcome> = {
		good: "good",
		ok: "ok",
		bad: "bad",
		travel: "travel",
		moved: "moved",
		switched: "switched_provider",
		resume: "resume",
		other: "other",
	};
	return map[choice] ?? null;
}

// ── Free-form replies (inside the 24h window the tap opens) ─────────────────

/** wa.me link to the support bot, pre-filled with the follow-up reference. */
export function supportBotLink(followUpId: string): string | null {
	const number = parsePhone(
		process.env["SUPPORT_BOT_WHATSAPP_NUMBER"] ?? "",
	)?.digits;
	if (!number) {
		return null;
	}
	const text = `مرحبا، بخصوص رسالة LibanCom (FU-${followUpId.slice(-6)})`;
	return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/** The free-form answer to each button, or null for none. */
export function outreachFollowUpText(
	outcome: OutreachOutcome,
	followUpId: string,
): string | null {
	const link = supportBotLink(followUpId);
	switch (outcome) {
		case "travel":
			return "تمام، الله يوصلك بالسلامة 🙏 وقت ما ترجع وبدك نرجّع الخط، بس ابعتلنا هون.";
		case "moved":
			return "منقدر ننقل الاشتراك على بيتك الجديد! شو المنطقة أو العنوان الجديد؟ فريقنا رح يتواصل معك.";
		case "switched_provider":
			return "منأسف إنك تركتنا 🙏 شو كان السبب؟ السعر، السرعة، الانقطاعات أو الخدمة؟ رأيك بيهمّنا.";
		case "resume":
			return "أكيد! فريقنا رح يتواصل معك اليوم لنرجّع الخط 🙏";
		case "other":
			return "شو السبب؟ اكتبلنا هون 🙏";
		case "good":
			return link
				? `منشكرك! 🙏 إذا احتجت أي شي، الدعم الفني موجود على واتساب: ${link}`
				: "منشكرك! 🙏 إذا احتجت أي شي، ابعتلنا هون.";
		case "ok":
			return "شو فينا نحسّن؟ اكتبلنا هون 🙏";
		case "bad":
			return link
				? `منأسف! شو المشكلة اللي عم تواجهها؟ فريق الدعم رح يتابع معك، وفيك تحكي الدعم مباشرة هون: ${link}`
				: "منأسف! شو المشكلة اللي عم تواجهها؟ فريق الدعم رح يتابع معك.";
		default:
			return null;
	}
}

/** Outcomes that need a human: a task + a Telegram alert. */
const TASK_FOR_OUTCOME: Partial<
	Record<
		OutreachOutcome,
		{
			category: "SUPPORT" | "INSTALLATION" | "GENERAL" | "BILLING";
			title: string;
		}
	>
> = {
	bad: { category: "SUPPORT", title: "Post-install: customer unhappy" },
	moved: {
		category: "INSTALLATION",
		title: "Stopped — moved house, wants/may want transfer",
	},
	switched_provider: {
		category: "GENERAL",
		title: "Churned to competitor — call back",
	},
	resume: { category: "BILLING", title: "Wants to resume" },
};

/** Answers that close the loop on their own. */
const TERMINAL_OUTCOMES = new Set<OutreachOutcome>([
	"good",
	"travel",
	"resume",
]);

// ── Scheduling ──────────────────────────────────────────────────────────────

export interface ScheduleOutreachInput {
	type: OutreachType;
	organizationId: string;
	customerId: string;
	/** Defaults to the customer's primary mobile. */
	phone?: string | null | undefined;
	setupRequestId?: string | null | undefined;
	paymentId?: string | null | undefined;
	/** When the triggering event happened (approval). Defaults to now. */
	at?: Date | undefined;
}

export interface ScheduleOutreachResult {
	status: "pending_approval" | "scheduled" | "skipped";
	reason?: string;
	id?: string;
}

/**
 * The agent that owns the org's outreach settings: its first enabled agent
 * with an enabled WhatsApp channel (same rule as open-conversation-by-phone).
 */
async function resolveOutreachAgent(organizationId: string) {
	const channel = await db.aiAgentChannel.findFirst({
		where: {
			provider: "whatsapp",
			enabled: true,
			agent: { organizationId, enabled: true },
		},
		orderBy: { lastActivityAt: "desc" },
		select: {
			agent: {
				select: {
					id: true,
					outreachRequireApproval: true,
					postInstallFollowUpDays: true,
					postStopFollowUpEnabled: true,
					postStopFollowUpTime: true,
				},
			},
		},
	});
	return channel?.agent ?? null;
}

/**
 * Queue one outreach message. Idempotent (one post_install per customer,
 * ever; one post_stop per stop payment, and none within 60 days of another).
 * Never throws: callers run it after their own work succeeded.
 */
export async function scheduleOutreach(
	input: ScheduleOutreachInput,
): Promise<ScheduleOutreachResult> {
	try {
		const agent = await resolveOutreachAgent(input.organizationId);
		if (!agent) {
			return { status: "skipped", reason: "no_agent" };
		}
		const at = input.at ?? new Date();
		let dueAt: Date;
		if (input.type === "post_install") {
			if (agent.postInstallFollowUpDays == null) {
				return { status: "skipped", reason: "disabled" };
			}
			const existing = await db.botFollowUp.findFirst({
				where: { customerId: input.customerId, type: "post_install" },
				select: { id: true },
			});
			if (existing) {
				return { status: "skipped", reason: "already_scheduled" };
			}
			dueAt = beirutDayAt(at, agent.postInstallFollowUpDays, "11:00");
		} else {
			if (!agent.postStopFollowUpEnabled) {
				return { status: "skipped", reason: "disabled" };
			}
			const recent = await db.botFollowUp.findFirst({
				where: {
					type: "post_stop",
					OR: [
						...(input.paymentId
							? [{ paymentId: input.paymentId }]
							: []),
						{
							customerId: input.customerId,
							createdAt: {
								gte: new Date(
									at.getTime() - 60 * 24 * 60 * 60 * 1000,
								),
							},
						},
					],
				},
				select: { id: true },
			});
			if (recent) {
				return { status: "skipped", reason: "already_scheduled" };
			}
			dueAt = beirutDayAt(at, 1, agent.postStopFollowUpTime);
		}

		const customer = await db.customer.findUnique({
			where: { id: input.customerId },
			select: { firstName: true, mobile: true },
		});
		const rawPhone = input.phone ?? customer?.mobile ?? null;
		const phone = parsePhone(rawPhone)?.digits ?? rawPhone;
		const status = agent.outreachRequireApproval
			? "pending_approval"
			: "scheduled";
		const row = await db.botFollowUp.create({
			data: {
				organizationId: input.organizationId,
				agentId: agent.id,
				type: input.type,
				channel: "official",
				status,
				customerId: input.customerId,
				setupRequestId: input.setupRequestId ?? null,
				paymentId: input.paymentId ?? null,
				phone,
				dueAt,
				templateName: outreachTemplateName(input.type),
				// Preview for the approval list; re-rendered at send time.
				messageText: renderOutreachBody(
					input.type,
					customer?.firstName ?? null,
					at,
				),
			},
			select: { id: true },
		});
		logger.info("[outreach] scheduled", {
			type: input.type,
			customerId: input.customerId,
			followUpId: row.id,
			status,
		});
		return { status, id: row.id };
	} catch (error) {
		logger.error("[outreach] schedule failed", {
			type: input.type,
			customerId: input.customerId,
			error,
		});
		return { status: "skipped", reason: "error" };
	}
}

function firstNameParam(firstName: string | null): string {
	return sanitizeTemplateParam(firstName, "عزيزنا", 40);
}

function stopDateParam(at: Date): string {
	const { day, month } = beirutParts(at);
	return arabicDayMonthLabel(day, month);
}

export function renderOutreachBody(
	type: OutreachType,
	firstName: string | null,
	eventAt: Date,
): string {
	return OUTREACH_DEFINITIONS[type].body(
		firstNameParam(firstName),
		stopDateParam(eventAt),
	);
}

// ── Sending (called by the bot-follow-ups sweep) ────────────────────────────

export interface OutreachRow {
	id: string;
	organizationId: string;
	agentId: string | null;
	type: string;
	customerId: string | null;
	paymentId: string | null;
	phone: string | null;
	createdAt: Date;
}

/**
 * The phone is also on another customer, an employee or a dealer — a
 * collector's or dealer's number typed on the customer row. Same suffix
 * match as the Salti dealer lookup (whatsapp-flow/…/dealer.ts).
 */
export async function isSharedPhone(
	organizationId: string,
	customerId: string,
	phone: string,
): Promise<boolean> {
	const core = toNationalDigits(phone);
	if (core.length < 7) {
		return false;
	}
	const suffix = `%${core}`;
	const rows = await db.$queryRaw<Array<{ n: bigint | number }>>`
		SELECT (
			(SELECT COUNT(*) FROM customer c
			  WHERE c."organizationId" = ${organizationId}
			    AND c.id <> ${customerId}
			    AND c."deletedAt" IS NULL
			    AND (
			      c.mobile LIKE ${suffix}
			      OR c.phone LIKE ${suffix}
			      OR EXISTS (
			        SELECT 1 FROM jsonb_array_elements(c.phones) AS p
			        WHERE p->>'number' LIKE ${suffix}
			      )
			    ))
			+ (SELECT COUNT(*) FROM employee e
			    WHERE e."organizationId" = ${organizationId}
			      AND e."deletedAt" IS NULL
			      AND e.phone LIKE ${suffix})
			+ (SELECT COUNT(*) FROM isp_dealer d
			    WHERE d."deletedAt" IS NULL AND d.phone LIKE ${suffix})
		) AS n
	`;
	return Number(rows[0]?.n ?? 0) > 0;
}

/** Why a due outreach row must not go out, or null to send it. */
async function outreachSkipReason(
	row: OutreachRow,
	customer: { status: string; mobile: string | null } | null,
	phone: string | null,
): Promise<string | null> {
	if (!customer || !row.customerId) {
		return "customer_missing";
	}
	if (row.type === "post_install") {
		if (customer.status !== "ACTIVE") {
			return "not_active";
		}
		const openTask = await db.task.findFirst({
			where: {
				customerId: row.customerId,
				source: { in: ["MANUAL", "AI_ESCALATION"] },
				status: { in: ["OPEN", "IN_PROGRESS", "ON_HOLD"] },
				createdAt: { gte: row.createdAt },
			},
			select: { id: true },
		});
		if (openTask) {
			return "open_issue";
		}
	} else {
		if (customer.status === "ACTIVE") {
			return "reactivated";
		}
		const contactIds = phone ? [phone, `+${phone}`] : [];
		const talked = await db.aiMessage.findFirst({
			where: {
				role: "user",
				createdAt: { gte: row.createdAt },
				conversation: {
					OR: [
						{ verifiedCustomerId: row.customerId },
						...(contactIds.length
							? [{ contactId: { in: contactIds } }]
							: []),
					],
				},
			},
			select: { id: true },
		});
		if (talked) {
			return "already_talked";
		}
	}
	if (!phone) {
		return "invalid_phone";
	}
	const suppressed = await db.marketingSuppression.findFirst({
		where: { organizationId: row.organizationId, phone },
		select: { id: true },
	});
	if (suppressed) {
		return "suppressed";
	}
	if (await isSharedPhone(row.organizationId, row.customerId, phone)) {
		return "shared_phone";
	}
	return null;
}

/**
 * Send one claimed (`sending`) outreach row as its Salti template with
 * quick-reply buttons. Returns the row's final status.
 */
export async function sendOutreachTemplate(row: OutreachRow): Promise<string> {
	const type = row.type as OutreachType;
	const definition = OUTREACH_DEFINITIONS[type];
	if (!definition) {
		await finish(row.id, "skipped", { skipReason: "unknown_type" });
		return "skipped";
	}
	const templateName = outreachTemplateName(type);
	if (!templateName) {
		logger.warn("[outreach] template not configured, not sending", {
			type,
			env: definition.templateEnv,
			followUpId: row.id,
		});
		await finish(row.id, "skipped", {
			skipReason: "template_not_configured",
		});
		return "skipped";
	}

	const customer = row.customerId
		? await db.customer.findUnique({
				where: { id: row.customerId },
				select: { status: true, mobile: true, firstName: true },
			})
		: null;
	// The number at send time wins; the stored one is the fallback.
	const phone =
		parsePhone(customer?.mobile)?.digits ??
		parsePhone(row.phone)?.digits ??
		null;
	const skipReason = await outreachSkipReason(row, customer, phone);
	if (skipReason || !phone) {
		logger.info("[outreach] skipped", {
			followUpId: row.id,
			type,
			reason: skipReason ?? "invalid_phone",
		});
		await finish(row.id, "skipped", {
			skipReason: skipReason ?? "invalid_phone",
		});
		return "skipped";
	}

	let eventAt = row.createdAt;
	if (type === "post_stop" && row.paymentId) {
		const payment = await db.payment.findUnique({
			where: { id: row.paymentId },
			select: { reviewedAt: true },
		});
		eventAt = payment?.reviewedAt ?? row.createdAt;
	}
	const bodyParams =
		type === "post_install"
			? [firstNameParam(customer?.firstName ?? null)]
			: [
					firstNameParam(customer?.firstName ?? null),
					stopDateParam(eventAt),
				];
	const result = await sendWPBoxTemplate({
		phone,
		templateName,
		templateLanguage: "ar",
		components: [
			{
				type: "body",
				parameters: bodyParams.map((text) => ({
					type: "text" as const,
					text,
				})),
			},
			...quickReplyButtons(row.id, definition.choices),
		],
		logContext: { followUpId: row.id, type },
		logTag: "[Outreach]",
	});
	if (!result.ok) {
		await finish(row.id, "failed", {
			skipReason: result.error.slice(0, 500),
			phone,
			templateName,
		});
		return "failed";
	}
	await finish(row.id, "sent", {
		sentAt: new Date(),
		phone,
		templateName,
		messageText: renderOutreachBody(
			type,
			customer?.firstName ?? null,
			eventAt,
		),
		externalMessageId: result.wamid ?? result.messageId,
	});
	return "sent";
}

async function finish(
	id: string,
	status: string,
	data: {
		skipReason?: string;
		sentAt?: Date;
		phone?: string;
		templateName?: string;
		messageText?: string;
		externalMessageId?: string | null;
	},
): Promise<void> {
	await db.botFollowUp.update({
		where: { id },
		data: { status, ...data },
	});
}

// ── Answers (Salti webhook + nightly reconcile) ─────────────────────────────

const PAYLOAD_RE = /^fu_([a-z0-9]+)_([a-z_]+)$/;

export function parseFollowUpPayload(
	payload: string | null | undefined,
): { id: string; choice: string } | null {
	const m = payload ? PAYLOAD_RE.exec(payload) : null;
	return m?.[1] && m[2] ? { id: m[1], choice: m[2] } : null;
}

const followUpSelect = {
	id: true,
	organizationId: true,
	agentId: true,
	type: true,
	status: true,
	outcome: true,
	reason: true,
	customerId: true,
	taskId: true,
	phone: true,
	messageText: true,
	reply: true,
	replyAt: true,
	organization: { select: { slug: true } },
	customer: {
		select: { firstName: true, lastName: true, username: true },
	},
} as const;

type AnswerRow = NonNullable<Awaited<ReturnType<typeof findRowById>>>;

function findRowById(id: string) {
	return db.botFollowUp.findUnique({
		where: { id },
		select: followUpSelect,
	});
}

function customerLabel(row: AnswerRow): string {
	const name =
		[row.customer?.firstName, row.customer?.lastName]
			.filter(Boolean)
			.join(" ") || "Unknown customer";
	return row.customer?.username ? `${name} (${row.customer.username})` : name;
}

function customerLink(row: AnswerRow): string | null {
	return row.customerId && row.organization.slug
		? `${getBaseUrl()}/app/${row.organization.slug}/customers/${row.customerId}`
		: null;
}

const TYPE_LABEL: Record<string, string> = {
	post_install: "install",
	post_stop: "stop",
};

async function alertTeam(row: AnswerRow, message: string): Promise<void> {
	if (!row.agentId) {
		return;
	}
	const link = customerLink(row);
	await notifyTeamTelegram(
		row.agentId,
		link ? `${message}\n${link}` : message,
	);
}

async function ensureTask(row: AnswerRow, outcome: OutreachOutcome) {
	const spec = TASK_FOR_OUTCOME[outcome];
	if (!spec || row.taskId) {
		return;
	}
	const name = customerLabel(row);
	const task = await db.task.create({
		data: {
			organizationId: row.organizationId,
			title: `${spec.title} — ${name}`.slice(0, 500),
			description: [
				`Bot follow-up (${row.type}) answer: ${outcome}.`,
				row.reply ? `Customer wrote: ${row.reply}` : null,
				row.messageText ? `We sent: ${row.messageText}` : null,
			]
				.filter(Boolean)
				.join("\n")
				.slice(0, 5000),
			priority: "MEDIUM",
			status: "OPEN",
			category: spec.category,
			// Lands on the Escalations page with the bot's other hand-offs.
			source: "AI_ESCALATION",
			customerId: row.customerId,
		},
		select: { id: true },
	});
	await db.botFollowUp.update({
		where: { id: row.id },
		data: { taskId: task.id },
	});
	row.taskId = task.id;
}

async function sendFreeForm(row: AnswerRow, phone: string, text: string) {
	const result = await sendWPBoxMessage({
		phone,
		message: text,
		logContext: { followUpId: row.id },
		logTag: "[Outreach reply]",
	});
	if (!result.ok) {
		logger.warn("[outreach] free-form reply failed", {
			followUpId: row.id,
			error: result.error,
		});
	}
}

/** A button tap: store the answer and run its branch. */
async function applyChoice(
	row: AnswerRow,
	outcome: OutreachOutcome,
	text: string,
	phone: string,
): Promise<void> {
	const now = new Date();
	await db.botFollowUp.update({
		where: { id: row.id },
		data: {
			outcome,
			reply: text.slice(0, 2000),
			replyAt: now,
			status: TERMINAL_OUTCOMES.has(outcome) ? "resolved" : "replied",
		},
	});
	row.outcome = outcome;
	row.reply = text;
	row.replyAt = now;

	const answer = outreachFollowUpText(outcome, row.id);
	if (answer) {
		await sendFreeForm(row, phone, answer);
	}
	if (TASK_FOR_OUTCOME[outcome]) {
		await ensureTask(row, outcome);
		const emoji = outcome === "bad" ? "👎" : "📋";
		await alertTeam(
			row,
			`📋 ${row.type === "post_install" ? "Install" : "Stop"} follow-up: ${emoji} <b>${escapeTelegramHtml(customerLabel(row))}</b> — ${escapeTelegramHtml(text)}`,
		);
	}
}

/** Free text: append it, classify the first answer, tell the team. */
async function applyText(
	row: AnswerRow,
	text: string,
	phone: string,
): Promise<void> {
	const now = new Date();
	const reply = (row.reply ? `${row.reply}\n${text}` : text).slice(0, 2000);

	if (isOptOutReply(text)) {
		await db.marketingSuppression.upsert({
			where: {
				organizationId_phone: {
					organizationId: row.organizationId,
					phone,
				},
			},
			create: {
				organizationId: row.organizationId,
				phone,
				reason: "Asked to stop messages (bot follow-up)",
				source: "bot_follow_up",
			},
			update: {},
		});
		await db.botFollowUp.update({
			where: { id: row.id },
			data: {
				reply,
				replyAt: row.replyAt ?? now,
				status: "resolved",
				reason: "Customer asked not to be messaged",
			},
		});
		await alertTeam(
			row,
			`🔕 ${escapeTelegramHtml(customerLabel(row))} asked us to stop messaging (added to opt-outs).`,
		);
		return;
	}

	let outcome = row.outcome as OutreachOutcome | null;
	let reason = row.reason;
	if (!outcome && row.agentId) {
		const agent = await db.aiAgent.findUnique({
			where: { id: row.agentId },
			select: { provider: true, encryptedApiKey: true },
		});
		try {
			const verdict = agent
				? await classifyOutreachReply({
						credentials: resolveAgentCredentials(agent),
						type: row.type as OutreachType,
						sentText: row.messageText,
						replies: [reply],
					})
				: null;
			if (verdict) {
				outcome = verdict.outcome;
				reason = verdict.reason;
			}
		} catch (error) {
			logger.warn("[outreach] reply not classified", {
				followUpId: row.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
	await db.botFollowUp.update({
		where: { id: row.id },
		data: {
			reply,
			replyAt: row.replyAt ?? now,
			status: row.status === "sent" ? "replied" : row.status,
			outcome,
			reason,
		},
	});
	row.reply = reply;
	row.outcome = outcome;
	if (outcome) {
		await ensureTask(row, outcome);
	}
	if (row.taskId) {
		const task = await db.task.findUnique({
			where: { id: row.taskId },
			select: { notes: true },
		});
		await db.task.update({
			where: { id: row.taskId },
			data: {
				notes: appendTaskNote(
					task?.notes ?? null,
					`[${formatBeirutStamp(now)} Beirut] Customer replied to the ${TYPE_LABEL[row.type] ?? row.type} follow-up: ${text}`,
				),
			},
		});
	}
	await alertTeam(
		row,
		`📋 Reply to ${TYPE_LABEL[row.type] ?? row.type} follow-up — <b>${escapeTelegramHtml(customerLabel(row))}</b>: ${escapeTelegramHtml(text.slice(0, 1000))}`,
	);
}

export interface OutreachInbound {
	/** Sender, any format. */
	phone: string;
	/** Quick-reply payload, when the customer tapped a button. */
	payload?: string | null | undefined;
	/** Button title or message text. */
	text: string;
}

/**
 * Route one inbound official-number message to its follow-up row. Returns
 * false when it matches none (the message stays in the Salti inbox).
 */
export async function handleOutreachInbound(
	message: OutreachInbound,
): Promise<boolean> {
	const phone = parsePhone(message.phone)?.digits ?? message.phone;
	const tapped = parseFollowUpPayload(message.payload);
	let row: AnswerRow | null = null;
	if (tapped) {
		row = await findRowById(tapped.id);
	}
	if (!row) {
		row = await db.botFollowUp.findFirst({
			where: {
				phone,
				channel: "official",
				status: { in: ["sent", "replied", "resolved"] },
				sentAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
			},
			orderBy: { sentAt: "desc" },
			select: followUpSelect,
		});
	}
	if (!row) {
		return false;
	}

	// A tap, or a reply that is exactly one of the button texts (the read
	// API and some forwards only carry the title).
	const definition = OUTREACH_DEFINITIONS[row.type as OutreachType];
	const choice =
		tapped?.id === row.id
			? tapped.choice
			: definition?.choices[
					definition.buttonTitles.indexOf(message.text.trim())
				];
	const outcome = choice ? choiceOutcome(choice) : null;
	if (outcome && !row.outcome) {
		await applyChoice(row, outcome, message.text, phone);
	} else {
		await applyText(row, message.text, phone);
	}
	return true;
}

/** A Meta delivery status for a template we sent; only failures matter. */
export async function handleOutreachStatus(status: {
	id: string;
	status: string;
	error?: string | null | undefined;
}): Promise<void> {
	if (status.status !== "failed") {
		return;
	}
	await db.botFollowUp.updateMany({
		where: { externalMessageId: status.id, status: "sent" },
		data: {
			status: "failed",
			skipReason: (status.error ?? "delivery_failed").slice(0, 500),
		},
	});
}

// ── Meta webhook body (forwarded by WPBox) ───────────────────────────────────

interface MetaMessage {
	from?: string;
	type?: string;
	text?: { body?: string };
	button?: { payload?: string; text?: string };
	interactive?: {
		button_reply?: { id?: string; title?: string };
		list_reply?: { id?: string; title?: string };
	};
}

interface MetaStatus {
	id?: string;
	status?: string;
	errors?: Array<{ title?: string; message?: string }>;
}

interface MetaWebhookBody {
	entry?: Array<{
		changes?: Array<{
			value?: {
				metadata?: { phone_number_id?: string };
				messages?: MetaMessage[];
				statuses?: MetaStatus[];
			};
		}>;
	}>;
}

/** Messages and statuses in a Meta Cloud-API webhook body. */
export function parseMetaWebhook(
	body: unknown,
	phoneNumberId?: string | null,
): {
	messages: OutreachInbound[];
	statuses: Array<{ id: string; status: string; error: string | null }>;
} {
	const messages: OutreachInbound[] = [];
	const statuses: Array<{
		id: string;
		status: string;
		error: string | null;
	}> = [];
	const entries = (body as MetaWebhookBody | null)?.entry ?? [];
	for (const entry of entries) {
		for (const change of entry.changes ?? []) {
			const value = change.value;
			if (!value) {
				continue;
			}
			if (
				phoneNumberId &&
				value.metadata?.phone_number_id &&
				value.metadata.phone_number_id !== phoneNumberId
			) {
				continue;
			}
			for (const m of value.messages ?? []) {
				if (!m.from) {
					continue;
				}
				if (m.type === "button" && m.button) {
					messages.push({
						phone: m.from,
						payload: m.button.payload ?? null,
						text: m.button.text ?? "",
					});
				} else if (m.type === "interactive" && m.interactive) {
					const reply =
						m.interactive.button_reply ?? m.interactive.list_reply;
					messages.push({
						phone: m.from,
						payload: reply?.id ?? null,
						text: reply?.title ?? "",
					});
				} else if (m.type === "text" && m.text?.body) {
					messages.push({ phone: m.from, text: m.text.body });
				}
			}
			for (const s of value.statuses ?? []) {
				if (s.id && s.status) {
					statuses.push({
						id: s.id,
						status: s.status,
						error:
							s.errors?.[0]?.title ??
							s.errors?.[0]?.message ??
							null,
					});
				}
			}
		}
	}
	return { messages, statuses };
}

/** Process one forwarded Salti webhook body (the `salti-inbound` job). */
export async function processSaltiInbound(
	body: unknown,
): Promise<{ matched: number; ignored: number }> {
	const { messages, statuses } = parseMetaWebhook(
		body,
		process.env["SALTI_PHONE_NUMBER_ID"] || null,
	);
	let matched = 0;
	let ignored = 0;
	for (const message of messages) {
		if (!message.text && !message.payload) {
			ignored++;
			continue;
		}
		if (await handleOutreachInbound(message)) {
			matched++;
		} else {
			ignored++;
		}
	}
	for (const status of statuses) {
		await handleOutreachStatus(status);
	}
	return { matched, ignored };
}

// ── Nightly reconcile (WPBox forwards once, with no retry) ───────────────────

/**
 * Recover answers the webhook missed: for official rows sent in the last
 * 72 hours and still `sent`, read the Salti chat and replay the customer's
 * messages written after our template.
 */
export async function reconcileOutreachReplies(): Promise<number> {
	const since = new Date(Date.now() - 72 * 60 * 60 * 1000);
	const rows = await db.botFollowUp.findMany({
		where: {
			channel: "official",
			status: "sent",
			sentAt: { gte: since },
			phone: { not: null },
		},
		select: { id: true, phone: true, sentAt: true },
		take: 200,
	});
	if (rows.length === 0) {
		return 0;
	}
	const contacts = await fetchWPBoxConversations();
	if (!contacts) {
		logger.warn("[outreach] reconcile: Salti conversations unavailable");
		return 0;
	}
	const byPhone = new Map<string, WPBoxContact>();
	for (const contact of contacts) {
		const digits =
			parsePhone(String(contact.phone))?.digits ??
			String(contact.phone).replace(/\D/g, "");
		byPhone.set(digits, contact);
	}

	let recovered = 0;
	for (const row of rows) {
		const contact = row.phone ? byPhone.get(row.phone) : undefined;
		if (!contact || !row.phone || !row.sentAt) {
			continue;
		}
		const messages = await fetchWPBoxMessages(contact.id);
		const sentAt = row.sentAt.getTime();
		const answers = (messages ?? [])
			.filter(
				(m) =>
					Boolean(Number(m.is_message_by_contact)) &&
					m.value &&
					new Date(m.created_at).getTime() > sentAt,
			)
			.sort(
				(a, b) =>
					new Date(a.created_at).getTime() -
					new Date(b.created_at).getTime(),
			);
		for (const answer of answers) {
			await handleOutreachInbound({
				phone: row.phone,
				text: answer.value ?? "",
			});
		}
		if (answers.length > 0) {
			recovered++;
		}
	}
	logger.info("[outreach] reconcile done", {
		checked: rows.length,
		recovered,
	});
	return recovered;
}

// ── Bot context when the customer writes to the support bot instead ─────────

/**
 * The newest official-number follow-up for this customer (or phone, or the
 * `FU-xxxxxx` reference in the bot deep link) from the last 7 days, rendered
 * for the bot's system prompt. undefined when there is none. Never throws.
 */
export async function loadOutreachContext(input: {
	organizationId: string;
	customerId: string | null;
	phone: string | null;
	messageText?: string | null | undefined;
}): Promise<string | undefined> {
	try {
		const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
		const digits = parsePhone(input.phone)?.digits ?? null;
		const ref = /FU-([a-z0-9]{6})\b/i.exec(input.messageText ?? "")?.[1];
		const or = [
			...(ref ? [{ id: { endsWith: ref.toLowerCase() } }] : []),
			...(input.customerId ? [{ customerId: input.customerId }] : []),
			...(digits ? [{ phone: digits }] : []),
		];
		if (or.length === 0) {
			return undefined;
		}
		const row = await db.botFollowUp.findFirst({
			where: {
				organizationId: input.organizationId,
				channel: "official",
				sentAt: { gte: since },
				OR: or,
			},
			orderBy: { sentAt: "desc" },
			select: {
				type: true,
				sentAt: true,
				messageText: true,
				reply: true,
				outcome: true,
			},
		});
		return row ? renderOutreachContext(row) : undefined;
	} catch (error) {
		logger.warn("[outreach] context not loaded", { error: String(error) });
		return undefined;
	}
}
