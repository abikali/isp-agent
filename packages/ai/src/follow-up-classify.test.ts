import { describe, expect, it } from "vitest";
import { isOptOutReply } from "./follow-up-classify";

describe("isOptOutReply", () => {
	it.each([
		"stop",
		"STOP.",
		"لا تبعتولي",
		"ما تبعتولي بعد",
		"la tb3atouli",
		"وقفوا الرسائل",
	])("treats %s as an opt-out", (text) => {
		expect(isOptOutReply(text)).toBe(true);
	});

	it.each([
		"my internet stopped",
		"لا ما رجع الانترنت",
		"ok",
		"stop the line please, I am travelling",
	])("does not treat %s as an opt-out", (text) => {
		expect(isOptOutReply(text)).toBe(false);
	});
});
