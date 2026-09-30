import { describe, expect, it } from "vitest";
import {
	buildEpisodeTranscript,
	type EpisodeRow,
	isSubstantiveEpisode,
} from "./conversation-summary";

const user = (content: string): EpisodeRow => ({ role: "user", content });
const bot = (content: string, isFollowUp = false): EpisodeRow => ({
	role: "assistant",
	content,
	isFollowUp,
});

describe("isSubstantiveEpisode", () => {
	it("needs two customer messages and one real bot reply", () => {
		expect(isSubstantiveEpisode([user("hi"), bot("hello")])).toBe(false);
		expect(
			isSubstantiveEpisode([user("hi"), bot("hello"), user("no net")]),
		).toBe(true);
	});

	it("does not count automatic nudges as bot replies", () => {
		expect(
			isSubstantiveEpisode([
				user("hi"),
				user("?"),
				bot("still there?", true),
			]),
		).toBe(false);
	});

	it("is always substantive when an escalation happened", () => {
		expect(isSubstantiveEpisode([user("call me")], true)).toBe(true);
	});
});

describe("buildEpisodeTranscript", () => {
	it("labels roles and adds one line per tool result", () => {
		const transcript = buildEpisodeTranscript([
			user("ma fi internet"),
			{
				role: "assistant",
				content: "Your line is online now.",
				parts: [
					{ type: "text", text: "Your line is online now." },
					{
						type: "tool-isp-diagnose-customer",
						output: { online: true, ap: "ok" },
					},
				],
			},
			{ role: "admin", content: "We fixed the antenna." },
		]);
		expect(transcript).toBe(
			[
				"Customer: ma fi internet",
				'[Tool isp-diagnose-customer: {"online":true,"ap":"ok"}]',
				"Agent: Your line is online now.",
				"Team: We fixed the antenna.",
			].join("\n"),
		);
	});

	it("strips internal markers and truncates tool output", () => {
		const transcript = buildEpisodeTranscript([
			{
				role: "assistant",
				content:
					"[Context Notice: earlier exchange] [Check-back: 24 hours ago…] Did the team reach you?",
				parts: [{ type: "tool-speed-test", output: "x".repeat(500) }],
			},
		]);
		expect(transcript).not.toContain("Context Notice");
		expect(transcript).not.toContain("Check-back");
		expect(transcript).toContain("Agent: Did the team reach you?");
		const toolLine = transcript.split("\n")[0] ?? "";
		expect(toolLine.length).toBeLessThan(230);
	});

	it("keeps only the last 40 rows and marks follow-ups", () => {
		const rows = Array.from({ length: 50 }, (_, i) => user(`m${i}`));
		rows.push(bot("any news?", true));
		const lines = buildEpisodeTranscript(rows).split("\n");
		expect(lines).toHaveLength(40);
		expect(lines[lines.length - 1]).toBe(
			"Agent (automatic follow-up): any news?",
		);
		expect(lines[0]).toBe("Customer: m11");
	});
});
