import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirstMessage, findManyCustomers, updateMany, update } = vi.hoisted(
	() => ({
		findFirstMessage: vi.fn(),
		findManyCustomers: vi.fn(),
		updateMany: vi.fn(),
		update: vi.fn(),
	}),
);

vi.mock("@repo/database", () => ({
	db: {
		aiMessage: { findFirst: findFirstMessage },
		customer: { findMany: findManyCustomers },
		aiConversation: { updateMany, update },
	},
}));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import type { DbMessageRow } from "./history";
import type { ToolRecord } from "./types";
import {
	isSubstantiveCustomerText,
	maybeEscalateUnknownContact,
} from "./unknown-contact";

const NOW = new Date("2026-09-14T06:30:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

const execute = vi.fn();
const tools = {
	"escalate-telegram": { execute },
} as unknown as ToolRecord;

function row(
	role: string,
	content: string,
	createdAt: Date,
	extra: Partial<DbMessageRow> = {},
): DbMessageRow {
	return { role, content, createdAt, ...extra };
}

function run(
	history: DbMessageRow[],
	overrides: {
		unknownEscalatedAt?: Date | null;
		verifiedCustomerId?: string | null;
		replyText?: string;
	} = {},
) {
	return maybeEscalateUnknownContact({
		conversation: {
			id: "conv-1",
			organizationId: "org-1",
			contactName: "Joseph",
			contactId: "96170000000",
			verifiedCustomerId: overrides.verifiedCustomerId ?? null,
			unknownEscalatedAt: overrides.unknownEscalatedAt ?? null,
		},
		enabledTools: ["escalate-telegram"],
		tools,
		history,
		contextGapThresholdMinutes: 240,
		replyText: overrides.replyText ?? "Sure, which area are you in?",
		now: NOW,
	});
}

const realExchange = [
	row("user", "hello I want to subscribe", minutesAgo(20)),
	row("assistant", "Welcome! Where are you located?", minutesAgo(19)),
	row("user", "I live in Dekwaneh near the church", minutesAgo(2)),
];

beforeEach(() => {
	vi.clearAllMocks();
	findFirstMessage.mockResolvedValue(null);
	findManyCustomers.mockResolvedValue([]);
	updateMany.mockResolvedValue({ count: 1 });
	update.mockResolvedValue({});
	execute.mockResolvedValue({ success: true, message: "sent" });
});

describe("isSubstantiveCustomerText", () => {
	it.each([
		["لذب٨", false],
		["👍", false],
		["ok", false],
		["?? 123", false],
		["[Voice message received]", false],
		["[Image: a router with a red LOS light]", false],
		["النت مقطوع", true],
		["internet", true],
		["hello there", true],
		["[Image: router] my internet is down", true],
	])("%s → %s", (text, expected) => {
		expect(isSubstantiveCustomerText(text)).toBe(expected);
	});
});

describe("maybeEscalateUnknownContact", () => {
	it("does not escalate a chat revived after months with one stray message (Joseph)", async () => {
		const april = new Date("2026-04-20T08:00:00Z");
		const history = [
			row("user", "الانترنت مقطوع عنا من الصبح", april),
			row(
				"assistant",
				"We are aware of an outage in your area",
				new Date(april.getTime() + 60_000),
			),
			row(
				"user",
				"بعدو مقطوع لهلق شو القصة",
				new Date(april.getTime() + 86_400_000),
			),
			row(
				"assistant",
				"The team is working on it",
				new Date(april.getTime() + 86_460_000),
			),
			row("user", "لذب٨", minutesAgo(1)),
		];
		expect(await run(history)).toBeNull();
		expect(execute).not.toHaveBeenCalled();
		expect(updateMany).not.toHaveBeenCalled();
	});

	it("escalates after two real messages and a bot reply, with the tool result recorded", async () => {
		const out = await run(realExchange);
		expect(out?.note).toBe(
			"I've notified a team member who will join you shortly.",
		);
		expect(out?.toolResult.toolCallId).toBe("unknown-conv-1");
		expect(out?.toolResult.toolName).toBe("escalate-telegram");
		expect(execute).toHaveBeenCalledTimes(1);
		const [args, options] = execute.mock.calls[0] ?? [];
		expect(args.priority).toBe("medium");
		expect(args.summary).toContain("Dekwaneh");
		expect(options.toolCallId).toBe("unknown-conv-1");
		expect(updateMany).toHaveBeenCalledTimes(1);
	});

	it("writes the sentence in Arabic when the reply is Arabic", async () => {
		const out = await run(realExchange, { replyText: "أهلا، وين موقعك؟" });
		expect(out?.note).toMatch(/[؀-ۿ]/);
	});

	it("ignores trivial messages and the bot's own rows", async () => {
		const history = [
			row("user", "hello I want to subscribe", minutesAgo(20)),
			row("assistant", "Welcome! Where are you located?", minutesAgo(19)),
			row("user", "👍", minutesAgo(2)),
		];
		expect(await run(history)).toBeNull();
	});

	it("waits until the bot has replied at least once", async () => {
		const history = [
			row("user", "hello I want to subscribe", minutesAgo(3)),
			row("user", "I live in Dekwaneh near the church", minutesAgo(2)),
		];
		expect(await run(history)).toBeNull();
	});

	it("counts only the current exchange after an ordinary pause", async () => {
		const history = [
			row("user", "hello I want to subscribe", minutesAgo(600)),
			row(
				"assistant",
				"Welcome! Where are you located?",
				minutesAgo(599),
			),
			row("user", "I live in Dekwaneh near the church", minutesAgo(2)),
		];
		expect(await run(history)).toBeNull();
	});

	it("skips when a teammate wrote in the last 7 days", async () => {
		findFirstMessage.mockResolvedValue({ id: "admin-row" });
		expect(await run(realExchange)).toBeNull();
		expect(execute).not.toHaveBeenCalled();
	});

	it("skips when the phone matches exactly one customer of any status", async () => {
		findManyCustomers.mockResolvedValue([{ id: "c1", status: "PENDING" }]);
		expect(await run(realExchange)).toBeNull();
		expect(execute).not.toHaveBeenCalled();
	});

	it("still escalates when the phone matches several customers", async () => {
		findManyCustomers.mockResolvedValue([
			{ id: "c1", status: "ACTIVE" },
			{ id: "c2", status: "PENDING" },
		]);
		expect(await run(realExchange)).not.toBeNull();
	});

	it("fires once per exchange, again after a revived chat", async () => {
		expect(
			await run(realExchange, { unknownEscalatedAt: minutesAgo(5) }),
		).toBeNull();
		expect(
			await run(realExchange, { unknownEscalatedAt: minutesAgo(3000) }),
		).not.toBeNull();
	});

	it("does nothing when another run already claimed the exchange", async () => {
		updateMany.mockResolvedValue({ count: 0 });
		expect(await run(realExchange)).toBeNull();
		expect(execute).not.toHaveBeenCalled();
	});

	it("releases the claim when the escalation fails", async () => {
		execute.mockResolvedValue({ success: false, message: "failed" });
		expect(await run(realExchange)).toBeNull();
		expect(update).toHaveBeenCalledWith({
			where: { id: "conv-1" },
			data: { unknownEscalatedAt: null },
		});
	});

	it("never runs for a verified conversation", async () => {
		expect(
			await run(realExchange, { verifiedCustomerId: "c1" }),
		).toBeNull();
	});
});
