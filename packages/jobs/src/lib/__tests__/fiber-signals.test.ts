import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/database", () => ({ db: {}, Prisma: {} }));
vi.mock("@repo/ai", () => ({
	classifyFiberInterest: vi.fn(),
	resolveAgentCredentials: vi.fn(),
}));
vi.mock("../../connection", () => ({ getRedisConnection: vi.fn() }));
vi.mock("@repo/logs", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

import { FIBER_PATTERN, mentionsOgero, OGERO_PATTERN } from "../fiber-signals";

// The sweep matches in Postgres (`~*`); JS's case-insensitive regex agrees
// on these plain alternations, so the same patterns are tested here.
const fiber = new RegExp(FIBER_PATTERN, "i");
const ogero = new RegExp(OGERO_PATTERN, "i");

describe("fiber signal patterns", () => {
	it("catches fiber in Arabic, English and Arabizi as customers write it", () => {
		for (const text of [
			"شو الفرق بين الانترنت العادي والفايبر",
			"Ana fine rakib fiber ?",
			"Fi Fiber sin el fil?",
			"bade faiber",
			"ركب ألياف",
		]) {
			expect(fiber.test(text), text).toBe(true);
		}
	});

	it("catches Ogero spellings, including collectors' stop notes", () => {
		for (const text of [
			"Mafi bas sandou2 la ogero",
			"كنّسل يلّي عملتها عند أوجيرو",
			"هدا اخد من اجيرو",
			"OJERO",
		]) {
			expect(ogero.test(text), text).toBe(true);
			expect(mentionsOgero(text)).toBe(true);
		}
	});

	it("ignores ordinary support messages", () => {
		for (const text of [
			"el internet 3am ye2ta3",
			"بدي جدد الاشتراك",
			"router reset",
			"interested in non-fiber internet plans",
		]) {
			expect(fiber.test(text) || ogero.test(text), text).toBe(false);
		}
	});
});
