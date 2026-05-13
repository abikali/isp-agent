import { describe, expect, it } from "vitest";
import { buildContextGapNote, dbMessagesToModelMessages } from "./history";

describe("buildContextGapNote", () => {
	it("returns null when lastMessageAt is null", () => {
		expect(buildContextGapNote(null, 240)).toBeNull();
	});

	it("returns null when gap is below threshold", () => {
		const tenMinutesAgo = new Date(Date.now() - 10 * 60_000);
		expect(buildContextGapNote(tenMinutesAgo, 240)).toBeNull();
	});

	it("returns a context notice when gap exceeds threshold", () => {
		const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60_000);
		const result = buildContextGapNote(fiveHoursAgo, 240);
		expect(result).not.toBeNull();
		expect(result).toContain("[Context Notice:");
		expect(result).toContain("5 hours");
		expect(result).toContain("Do not assume continuity");
	});

	it("formats single hour without plural", () => {
		const result = buildContextGapNote(
			new Date(Date.now() - 65 * 60_000),
			60,
		);
		expect(result).toContain("1 hour");
		expect(result).not.toContain("1 hours");
	});

	it("formats multiple hours", () => {
		const result = buildContextGapNote(
			new Date(Date.now() - 6 * 60 * 60_000),
			60,
		);
		expect(result).toContain("6 hours");
	});

	it("formats days without remaining hours", () => {
		const result = buildContextGapNote(
			new Date(Date.now() - 48 * 60 * 60_000),
			240,
		);
		expect(result).toContain("2 days");
	});

	it("formats days and hours together", () => {
		const result = buildContextGapNote(
			new Date(Date.now() - 27 * 60 * 60_000),
			240,
		);
		expect(result).toContain("1 day and 3 hours");
	});

	it("formats single day without plural", () => {
		const result = buildContextGapNote(
			new Date(Date.now() - 24 * 60 * 60_000),
			240,
		);
		expect(result).toContain("1 day");
		expect(result).not.toContain("1 days");
	});
});

describe("dbMessagesToModelMessages", () => {
	it("maps a user row to a single user ModelMessage", () => {
		const out = dbMessagesToModelMessages([
			{ role: "user", content: "Hi" },
		]);
		expect(out).toEqual([{ role: "user", content: "Hi" }]);
	});

	it("maps an assistant row without tools to a single assistant ModelMessage", () => {
		const out = dbMessagesToModelMessages([
			{ role: "assistant", content: "Hello." },
		]);
		expect(out).toEqual([{ role: "assistant", content: "Hello." }]);
	});

	it("prefixes admin (human takeover) replies so the model knows they're not its own output", () => {
		const out = dbMessagesToModelMessages([
			{ role: "admin", content: "Hi, this is John from support." },
		]);
		expect(out).toHaveLength(1);
		expect(out[0]?.role).toBe("assistant");
		expect(out[0]?.content).toBe(
			"[Human teammate reply]\nHi, this is John from support.",
		);
	});

	it("expands assistant rows with tool calls into structured assistant + tool messages", () => {
		const out = dbMessagesToModelMessages([
			{
				role: "assistant",
				content: "Let me check.",
				toolCalls: [
					{
						toolName: "isp-search-customer",
						args: { query: "john" },
						result: { found: true, name: "John" },
					},
				],
			},
		]);

		expect(out).toHaveLength(2);
		const assistant = out[0];
		const tool = out[1];

		expect(assistant?.role).toBe("assistant");
		expect(Array.isArray(assistant?.content)).toBe(true);
		const parts = assistant?.content as Array<{
			type: string;
			text?: string;
			toolName?: string;
			input?: unknown;
			toolCallId?: string;
		}>;
		expect(parts[0]?.type).toBe("text");
		expect(parts[0]?.text).toBe("Let me check.");
		expect(parts[1]?.type).toBe("tool-call");
		expect(parts[1]?.toolName).toBe("isp-search-customer");
		expect(parts[1]?.input).toEqual({ query: "john" });
		expect(typeof parts[1]?.toolCallId).toBe("string");

		expect(tool?.role).toBe("tool");
		const toolParts = tool?.content as Array<{
			type: string;
			toolCallId: string;
			toolName: string;
			output: { type: string; value: unknown };
		}>;
		expect(toolParts[0]?.type).toBe("tool-result");
		expect(toolParts[0]?.toolCallId).toBe(parts[1]?.toolCallId);
		expect(toolParts[0]?.output.type).toBe("json");
		expect(toolParts[0]?.output.value).toEqual({
			found: true,
			name: "John",
		});
	});

	it("preserves real toolCallId when one is stored", () => {
		const out = dbMessagesToModelMessages([
			{
				role: "assistant",
				content: "",
				toolCalls: [
					{
						toolCallId: "tool_abc123",
						toolName: "ping-host",
						args: { host: "1.1.1.1" },
						result: "ok",
					},
				],
			},
		]);

		const assistant = out[0]?.content as Array<{
			type: string;
			toolCallId?: string;
		}>;
		expect(assistant[0]?.toolCallId).toBe("tool_abc123");
	});

	it("emits empty tool-result when stored result is undefined (legacy data)", () => {
		const out = dbMessagesToModelMessages([
			{
				role: "assistant",
				content: "",
				toolCalls: [{ toolName: "ping-host", args: {} }],
			},
		]);

		const tool = out[1];
		expect(tool?.role).toBe("tool");
		const toolParts = tool?.content as Array<{
			type: string;
			output: { type: string; value: unknown };
		}>;
		expect(toolParts[0]?.output.type).toBe("text");
		expect(toolParts[0]?.output.value).toBe("");
	});

	it("ignores malformed toolCalls and falls back to plain assistant message", () => {
		const out = dbMessagesToModelMessages([
			{
				role: "assistant",
				content: "Plain response.",
				toolCalls: "not-an-array",
			},
		]);
		expect(out).toEqual([
			{ role: "assistant", content: "Plain response." },
		]);
	});

	it("invalidates the result of a poisoned ISP search (non-ASCII query)", () => {
		// Reproduces the `rolab` history-poisoning bug: an earlier turn
		// stored a tool call where the agent searched iRadius by an Arabic
		// name and got back an unrelated customer due to charset corruption
		// in iRadius `User.Mobile` (latin1). The fix substitutes the bad
		// result so the LLM doesn't keep recalling that wrong username.
		const out = dbMessagesToModelMessages([
			{
				role: "assistant",
				content: "Let me look that up.",
				toolCalls: [
					{
						toolName: "isp-diagnose-customer",
						args: { query: "أحمد رفيق" },
						result: {
							found: true,
							userName: "rolab",
							customerName: "Rola hani Bahsoun",
						},
					},
				],
			},
		]);

		const tool = out[1];
		expect(tool?.role).toBe("tool");
		const toolParts = tool?.content as Array<{
			output: { type: string; value: unknown };
		}>;
		expect(toolParts[0]?.output.value).toContain("invalidated");
		expect(JSON.stringify(toolParts[0]?.output.value)).not.toContain(
			"rolab",
		);
	});

	it("leaves ASCII ISP search results intact", () => {
		const out = dbMessagesToModelMessages([
			{
				role: "assistant",
				content: "",
				toolCalls: [
					{
						toolName: "isp-diagnose-customer",
						args: { query: "joseph1" },
						result: { found: true, userName: "joseph1" },
					},
				],
			},
		]);
		const tool = out[1];
		const toolParts = tool?.content as Array<{
			output: { value: unknown };
		}>;
		expect(toolParts[0]?.output.value).toEqual({
			found: true,
			userName: "joseph1",
		});
	});

	it("produces a flat chronological sequence from mixed history", () => {
		const out = dbMessagesToModelMessages([
			{ role: "user", content: "My internet is slow" },
			{
				role: "assistant",
				content: "Let me check.",
				toolCalls: [
					{
						toolName: "isp-search-customer",
						args: { phone: "96171123456" },
						result: { active: true, fupMode: "1" },
					},
				],
			},
			{
				role: "assistant",
				content: "You're in FUP mode — quota exceeded.",
			},
			{ role: "user", content: "Thanks" },
		]);

		// 1 user + (1 assistant + 1 tool) + 1 assistant + 1 user = 5 messages
		expect(out).toHaveLength(5);
		expect(out[0]?.role).toBe("user");
		expect(out[1]?.role).toBe("assistant");
		expect(out[2]?.role).toBe("tool");
		expect(out[3]?.role).toBe("assistant");
		expect(out[4]?.role).toBe("user");
	});
});
