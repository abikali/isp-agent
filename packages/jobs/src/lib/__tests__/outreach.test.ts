import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { db, ai, wpbox } = vi.hoisted(() => ({
	db: {
		aiAgentChannel: { findFirst: vi.fn() },
		aiAgent: { findUnique: vi.fn() },
		aiMessage: { findFirst: vi.fn() },
		botFollowUp: {
			findFirst: vi.fn(),
			findUnique: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			updateMany: vi.fn(),
		},
		customer: { findUnique: vi.fn() },
		marketingSuppression: { findFirst: vi.fn(), upsert: vi.fn() },
		payment: { findUnique: vi.fn() },
		task: {
			findFirst: vi.fn(),
			findUnique: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
		},
		$queryRaw: vi.fn(),
	},
	ai: {
		classifyOutreachReply: vi.fn(),
		escapeTelegramHtml: (t: string) => t,
		isOptOutReply: (t: string) => t.trim().toLowerCase() === "stop",
		notifyTeamTelegram: vi.fn(),
		renderOutreachContext: vi.fn(() => "CTX"),
		resolveAgentCredentials: vi.fn(() => ({
			provider: "openrouter",
			apiKey: "k",
		})),
	},
	wpbox: {
		sendWPBoxTemplate: vi.fn(),
		sendWPBoxMessage: vi.fn(),
		fetchWPBoxConversations: vi.fn(),
		fetchWPBoxMessages: vi.fn(),
	},
}));

vi.mock("@repo/ai", () => ai);
vi.mock("@repo/database", () => ({ db }));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../wpbox", async (importActual) => ({
	...(await importActual<typeof import("../wpbox")>()),
	...wpbox,
}));

import {
	handleOutreachInbound,
	loadOutreachContext,
	parseMetaWebhook,
	processSaltiInbound,
	reconcileOutreachReplies,
	scheduleOutreach,
	sendOutreachTemplate,
} from "../outreach";

const agent = {
	id: "agent-1",
	outreachRequireApproval: true,
	postInstallFollowUpDays: 3 as number | null,
	postStopFollowUpEnabled: true,
	postStopFollowUpTime: "09:00",
};

beforeEach(() => {
	vi.clearAllMocks();
	db.aiAgentChannel.findFirst.mockResolvedValue({ agent: { ...agent } });
	db.botFollowUp.findFirst.mockResolvedValue(null);
	db.botFollowUp.create.mockResolvedValue({ id: "fu1" });
	db.botFollowUp.update.mockResolvedValue({});
	db.customer.findUnique.mockResolvedValue({
		firstName: "Joseph",
		mobile: "+96170123456",
		status: "ACTIVE",
	});
	db.task.findFirst.mockResolvedValue(null);
	db.aiMessage.findFirst.mockResolvedValue(null);
	db.marketingSuppression.findFirst.mockResolvedValue(null);
	db.$queryRaw.mockResolvedValue([{ n: 0 }]);
	db.payment.findUnique.mockResolvedValue({
		reviewedAt: new Date("2026-09-29T08:00:00Z"),
	});
	wpbox.sendWPBoxTemplate.mockResolvedValue({
		ok: true,
		phone: "96170123456",
		status: 200,
		messageId: "55",
		wamid: "wamid.X",
	});
	wpbox.sendWPBoxMessage.mockResolvedValue({ ok: true });
	vi.stubEnv("SALTI_TEMPLATE_INSTALL_SATISFACTION", "install_satisfaction");
	vi.stubEnv("SALTI_TEMPLATE_SERVICE_STOP_REASON", "service_stop_reason");
	vi.stubEnv("SUPPORT_BOT_WHATSAPP_NUMBER", "+96181000000");
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("scheduleOutreach", () => {
	it("post-install: 3 days later at 11:00 Beirut (summer time)", async () => {
		const result = await scheduleOutreach({
			type: "post_install",
			organizationId: "org-1",
			customerId: "cust-1",
			setupRequestId: "sr-1",
			at: new Date("2026-09-30T15:00:00Z"),
		});
		expect(result).toEqual({ status: "pending_approval", id: "fu1" });
		const data = db.botFollowUp.create.mock.calls[0]?.[0]?.data;
		// 3 Oct 11:00 Beirut = 08:00 UTC (UTC+3)
		expect(data.dueAt).toEqual(new Date("2026-10-03T08:00:00Z"));
		expect(data).toMatchObject({
			type: "post_install",
			channel: "official",
			phone: "96170123456",
			setupRequestId: "sr-1",
		});
		expect(data.messageText).toContain("مرحباً Joseph");
	});

	it("post-install: DST change lands on 11:00 winter time", async () => {
		await scheduleOutreach({
			type: "post_install",
			organizationId: "org-1",
			customerId: "cust-1",
			at: new Date("2026-10-23T10:00:00Z"),
		});
		// 26 Oct 11:00 Beirut after the switch to UTC+2 = 09:00 UTC
		expect(db.botFollowUp.create.mock.calls[0]?.[0]?.data.dueAt).toEqual(
			new Date("2026-10-26T09:00:00Z"),
		);
	});

	it("post-stop: the next Beirut morning, scheduled without approval when off", async () => {
		db.aiAgentChannel.findFirst.mockResolvedValue({
			agent: { ...agent, outreachRequireApproval: false },
		});
		// 23:30 Beirut on 30 Sep → next day is 1 Oct.
		const result = await scheduleOutreach({
			type: "post_stop",
			organizationId: "org-1",
			customerId: "cust-1",
			paymentId: "pay-1",
			at: new Date("2026-09-30T20:30:00Z"),
		});
		expect(result.status).toBe("scheduled");
		const data = db.botFollowUp.create.mock.calls[0]?.[0]?.data;
		expect(data.dueAt).toEqual(new Date("2026-10-01T06:00:00Z"));
		expect(data.paymentId).toBe("pay-1");
	});

	it("is idempotent", async () => {
		db.botFollowUp.findFirst.mockResolvedValue({ id: "existing" });
		for (const type of ["post_install", "post_stop"] as const) {
			const result = await scheduleOutreach({
				type,
				organizationId: "org-1",
				customerId: "cust-1",
				paymentId: "pay-1",
			});
			expect(result).toEqual({
				status: "skipped",
				reason: "already_scheduled",
			});
		}
		expect(db.botFollowUp.create).not.toHaveBeenCalled();
		const stopQuery = db.botFollowUp.findFirst.mock.calls[1]?.[0]?.where;
		expect(stopQuery.OR[0]).toEqual({ paymentId: "pay-1" });
	});

	it("does nothing while the setting is off, and never throws", async () => {
		db.aiAgentChannel.findFirst.mockResolvedValue({
			agent: {
				...agent,
				postInstallFollowUpDays: null,
				postStopFollowUpEnabled: false,
			},
		});
		expect(
			await scheduleOutreach({
				type: "post_install",
				organizationId: "org-1",
				customerId: "cust-1",
			}),
		).toEqual({ status: "skipped", reason: "disabled" });
		db.aiAgentChannel.findFirst.mockRejectedValue(new Error("db down"));
		expect(
			await scheduleOutreach({
				type: "post_stop",
				organizationId: "org-1",
				customerId: "cust-1",
			}),
		).toEqual({ status: "skipped", reason: "error" });
	});
});

describe("sendOutreachTemplate", () => {
	const row = {
		id: "fu1",
		organizationId: "org-1",
		agentId: "agent-1",
		type: "post_stop",
		customerId: "cust-1",
		paymentId: "pay-1",
		phone: "96170123456",
		createdAt: new Date("2026-09-29T08:00:00Z"),
	};

	beforeEach(() => {
		db.customer.findUnique.mockResolvedValue({
			firstName: "Joseph",
			mobile: "+96170123456",
			status: "INACTIVE",
		});
	});

	it("sends the template with quick-reply payloads", async () => {
		expect(await sendOutreachTemplate(row)).toBe("sent");
		const call = wpbox.sendWPBoxTemplate.mock.calls[0]?.[0];
		expect(call.templateName).toBe("service_stop_reason");
		expect(call.templateLanguage).toBe("ar");
		expect(call.components[0].parameters).toEqual([
			{ type: "text", text: "Joseph" },
			{ type: "text", text: "29 أيلول" },
		]);
		expect(
			call.components
				.slice(1)
				.map(
					(c: { parameters: Array<{ payload: string }> }) =>
						c.parameters[0]?.payload,
				),
		).toEqual([
			"fu_fu1_travel",
			"fu_fu1_moved",
			"fu_fu1_switched",
			"fu_fu1_resume",
			"fu_fu1_other",
		]);
		expect(db.botFollowUp.update.mock.calls[0]?.[0]?.data).toMatchObject({
			status: "sent",
			externalMessageId: "wamid.X",
			templateName: "service_stop_reason",
		});
	});

	it("no-ops while the template name is not configured", async () => {
		vi.stubEnv("SALTI_TEMPLATE_SERVICE_STOP_REASON", "");
		expect(await sendOutreachTemplate(row)).toBe("skipped");
		expect(wpbox.sendWPBoxTemplate).not.toHaveBeenCalled();
		expect(db.botFollowUp.update.mock.calls[0]?.[0]?.data).toEqual({
			status: "skipped",
			skipReason: "template_not_configured",
		});
	});

	const skips: Array<[string, string, () => void]> = [
		[
			"post_stop",
			"reactivated",
			() =>
				db.customer.findUnique.mockResolvedValue({
					firstName: "J",
					mobile: "+96170123456",
					status: "ACTIVE",
				}),
		],
		[
			"post_stop",
			"already_talked",
			() => db.aiMessage.findFirst.mockResolvedValue({ id: "m" }),
		],
		[
			"post_stop",
			"suppressed",
			() =>
				db.marketingSuppression.findFirst.mockResolvedValue({
					id: "s",
				}),
		],
		[
			"post_stop",
			"shared_phone",
			() => db.$queryRaw.mockResolvedValue([{ n: 2 }]),
		],
		[
			"post_stop",
			"invalid_phone",
			() =>
				db.customer.findUnique.mockResolvedValue({
					firstName: "J",
					mobile: "abc",
					status: "INACTIVE",
				}),
		],
		[
			"post_install",
			"not_active",
			() =>
				db.customer.findUnique.mockResolvedValue({
					firstName: "J",
					mobile: "+96170123456",
					status: "INACTIVE",
				}),
		],
		[
			"post_install",
			"open_issue",
			() => {
				db.customer.findUnique.mockResolvedValue({
					firstName: "J",
					mobile: "+96170123456",
					status: "ACTIVE",
				});
				db.task.findFirst.mockResolvedValue({ id: "t" });
			},
		],
	];

	it.each(skips)("%s skips with %s", async (type, reason, arrange) => {
		arrange();
		const result = await sendOutreachTemplate({
			...row,
			type,
			phone:
				type === "post_stop" && reason === "invalid_phone"
					? null
					: row.phone,
		});
		expect(result).toBe("skipped");
		expect(db.botFollowUp.update.mock.calls[0]?.[0]?.data).toEqual({
			status: "skipped",
			skipReason: reason,
		});
		expect(wpbox.sendWPBoxTemplate).not.toHaveBeenCalled();
	});

	it("marks the row failed when Salti refuses", async () => {
		wpbox.sendWPBoxTemplate.mockResolvedValue({
			ok: false,
			phone: "96170123456",
			error: "Invalid template",
			retriable: false,
		});
		expect(await sendOutreachTemplate(row)).toBe("failed");
		expect(db.botFollowUp.update.mock.calls[0]?.[0]?.data).toMatchObject({
			status: "failed",
			skipReason: "Invalid template",
		});
	});
});

describe("Salti inbound", () => {
	const answerRow = {
		id: "fu1",
		organizationId: "org-1",
		agentId: "agent-1",
		type: "post_stop",
		status: "sent",
		outcome: null,
		reason: null,
		customerId: "cust-1",
		taskId: null,
		phone: "96170123456",
		messageText: "مرحباً Joseph…",
		reply: null,
		replyAt: null,
		organization: { slug: "libancom" },
		customer: { firstName: "Joseph", lastName: null, username: "joe" },
	};

	function metaBody(messages: unknown[], statuses: unknown[] = []) {
		return {
			entry: [
				{
					changes: [
						{
							value: {
								metadata: { phone_number_id: "PNID" },
								messages,
								statuses,
							},
						},
					],
				},
			],
		};
	}

	it("parses button taps, text, interactive replies and statuses", () => {
		const parsed = parseMetaWebhook(
			metaBody(
				[
					{
						from: "96170123456",
						type: "button",
						button: { payload: "fu_fu1_travel", text: "مسافر" },
					},
					{ from: "96170123456", type: "text", text: { body: "hi" } },
					{
						from: "96170123456",
						type: "interactive",
						interactive: {
							button_reply: { id: "x", title: "Yes" },
						},
					},
					{ from: "96170123456", type: "image" },
				],
				[
					{
						id: "wamid.X",
						status: "failed",
						errors: [{ title: "Bad" }],
					},
				],
			),
		);
		expect(parsed.messages).toEqual([
			{ phone: "96170123456", payload: "fu_fu1_travel", text: "مسافر" },
			{ phone: "96170123456", text: "hi" },
			{ phone: "96170123456", payload: "x", text: "Yes" },
		]);
		expect(parsed.statuses).toEqual([
			{ id: "wamid.X", status: "failed", error: "Bad" },
		]);
	});

	it("ignores another phone number's webhook", () => {
		const parsed = parseMetaWebhook(
			metaBody([{ from: "1", type: "text", text: { body: "x" } }]),
			"OTHER",
		);
		expect(parsed.messages).toEqual([]);
	});

	it("a travel tap thanks the customer and closes the loop, no task", async () => {
		db.botFollowUp.findUnique.mockResolvedValue({ ...answerRow });
		const matched = await handleOutreachInbound({
			phone: "96170123456",
			payload: "fu_fu1_travel",
			text: "مسافر / توقيف مؤقت",
		});
		expect(matched).toBe(true);
		expect(db.botFollowUp.update.mock.calls[0]?.[0]?.data).toMatchObject({
			outcome: "travel",
			status: "resolved",
			reply: "مسافر / توقيف مؤقت",
		});
		expect(wpbox.sendWPBoxMessage.mock.calls[0]?.[0]?.message).toContain(
			"الله يوصلك بالسلامة",
		);
		expect(db.task.create).not.toHaveBeenCalled();
	});

	it("a resume tap creates a billing task and alerts the team", async () => {
		db.botFollowUp.findUnique.mockResolvedValue({ ...answerRow });
		db.task.create.mockResolvedValue({ id: "task-1" });
		await handleOutreachInbound({
			phone: "96170123456",
			payload: "fu_fu1_resume",
			text: "بدي رجّع الخط",
		});
		expect(db.task.create.mock.calls[0]?.[0]?.data).toMatchObject({
			category: "BILLING",
			source: "AI_ESCALATION",
			customerId: "cust-1",
		});
		expect(ai.notifyTeamTelegram).toHaveBeenCalled();
	});

	it("a bad install answer links the support bot", async () => {
		db.botFollowUp.findUnique.mockResolvedValue({
			...answerRow,
			type: "post_install",
		});
		db.task.create.mockResolvedValue({ id: "task-1" });
		await handleOutreachInbound({
			phone: "96170123456",
			payload: "fu_fu1_bad",
			text: "في مشكلة 👎",
		});
		const message = wpbox.sendWPBoxMessage.mock.calls[0]?.[0]?.message;
		expect(message).toContain("https://wa.me/96181000000?text=");
		expect(message).toContain(encodeURIComponent("FU-fu1"));
	});

	it("free text is appended, classified and sent to the team", async () => {
		db.botFollowUp.findFirst.mockResolvedValue({
			...answerRow,
			outcome: null,
		});
		db.aiAgent.findUnique.mockResolvedValue({
			provider: "openrouter",
			encryptedApiKey: "enc",
		});
		ai.classifyOutreachReply.mockResolvedValue({
			outcome: "switched_provider",
			reason: "Cheaper elsewhere",
		});
		db.task.create.mockResolvedValue({ id: "task-2" });
		db.task.findUnique.mockResolvedValue({ notes: null });
		const matched = await handleOutreachInbound({
			phone: "+961 70 123 456",
			text: "rohet 3a shi sherke erkhas",
		});
		expect(matched).toBe(true);
		expect(db.botFollowUp.update.mock.calls[0]?.[0]?.data).toMatchObject({
			status: "replied",
			outcome: "switched_provider",
			reason: "Cheaper elsewhere",
		});
		expect(db.task.create).toHaveBeenCalled();
		expect(ai.notifyTeamTelegram).toHaveBeenCalledWith(
			"agent-1",
			expect.stringContaining("Reply to stop follow-up"),
		);
	});

	it("a reply that is exactly a button title counts as the tap", async () => {
		db.botFollowUp.findFirst.mockResolvedValue({ ...answerRow });
		await handleOutreachInbound({
			phone: "96170123456",
			text: "نقلت على بيت تاني",
		});
		expect(db.botFollowUp.update.mock.calls[0]?.[0]?.data.outcome).toBe(
			"moved",
		);
	});

	it("'stop' adds an opt-out", async () => {
		db.botFollowUp.findFirst.mockResolvedValue({ ...answerRow });
		await handleOutreachInbound({ phone: "96170123456", text: "STOP" });
		expect(db.marketingSuppression.upsert).toHaveBeenCalled();
		expect(ai.classifyOutreachReply).not.toHaveBeenCalled();
	});

	it("an unknown sender or payload is left for the Salti inbox", async () => {
		db.botFollowUp.findUnique.mockResolvedValue(null);
		db.botFollowUp.findFirst.mockResolvedValue(null);
		const result = await processSaltiInbound(
			metaBody([
				{
					from: "96179999999",
					type: "button",
					button: { payload: "fu_nope_travel", text: "x" },
				},
			]),
		);
		expect(result).toEqual({ matched: 0, ignored: 1 });
		expect(db.botFollowUp.update).not.toHaveBeenCalled();
	});

	it("a failed delivery status marks the row", async () => {
		db.botFollowUp.updateMany.mockResolvedValue({ count: 1 });
		await processSaltiInbound(
			metaBody([], [{ id: "wamid.X", status: "failed" }]),
		);
		expect(db.botFollowUp.updateMany).toHaveBeenCalledWith({
			where: { externalMessageId: "wamid.X", status: "sent" },
			data: { status: "failed", skipReason: "delivery_failed" },
		});
	});
});

describe("reconcileOutreachReplies", () => {
	it("replays answers the webhook missed", async () => {
		const sentAt = new Date(Date.now() - 3600_000);
		db.botFollowUp.findMany.mockResolvedValue([
			{ id: "fu1", phone: "96170123456", sentAt },
		]);
		wpbox.fetchWPBoxConversations.mockResolvedValue([
			{ id: 7, phone: "+96170123456" },
		]);
		wpbox.fetchWPBoxMessages.mockResolvedValue([
			{
				id: 2,
				value: "بدي رجّع الخط",
				is_message_by_contact: 1,
				created_at: new Date().toISOString(),
			},
			{
				id: 1,
				value: "old",
				is_message_by_contact: 1,
				created_at: new Date(sentAt.getTime() - 60_000).toISOString(),
			},
		]);
		db.botFollowUp.findFirst.mockResolvedValue({
			id: "fu1",
			organizationId: "org-1",
			agentId: "agent-1",
			type: "post_stop",
			status: "sent",
			outcome: null,
			reason: null,
			customerId: "cust-1",
			taskId: null,
			phone: "96170123456",
			messageText: "x",
			reply: null,
			replyAt: null,
			organization: { slug: "libancom" },
			customer: null,
		});
		db.task.create.mockResolvedValue({ id: "t" });

		expect(await reconcileOutreachReplies()).toBe(1);
		expect(wpbox.fetchWPBoxMessages).toHaveBeenCalledWith(7);
		expect(db.botFollowUp.update.mock.calls[0]?.[0]?.data.outcome).toBe(
			"resume",
		);
	});
});

describe("loadOutreachContext", () => {
	it("matches the FU reference from the deep link", async () => {
		db.botFollowUp.findFirst.mockResolvedValue({
			type: "post_stop",
			sentAt: new Date(),
			messageText: "x",
			reply: null,
			outcome: null,
		});
		const ctx = await loadOutreachContext({
			organizationId: "org-1",
			customerId: null,
			phone: null,
			messageText: "مرحبا، بخصوص رسالة LibanCom (FU-abc123)",
		});
		expect(ctx).toBe("CTX");
		expect(db.botFollowUp.findFirst.mock.calls[0]?.[0]?.where.OR).toEqual([
			{ id: { endsWith: "abc123" } },
		]);
	});
});
