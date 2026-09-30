import { bilingual, taskLinkFor } from "@repo/utils";
import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/database", () => ({ db: {}, parsePhones: () => [] }));
vi.mock("@repo/api/lib/notify-employee", () => ({
	notifyFieldEmployee: vi.fn(),
}));

const { taskCategoryLabel } = await import("../lib/notify-task-workers");

describe("taskLinkFor", () => {
	it("opens the task inside the field portal for workers", () => {
		expect(taskLinkFor("worker", "libancom", "task_1")).toBe(
			"/work/libancom/tasks?task=task_1",
		);
	});

	it("keeps the admin route for everyone else", () => {
		expect(taskLinkFor("standard", "libancom", "task_1")).toBe(
			"/app/libancom/tasks/task_1",
		);
		expect(taskLinkFor(undefined, "libancom", "task_1")).toBe(
			"/app/libancom/tasks/task_1",
		);
	});
});

describe("taskCategoryLabel", () => {
	it("pairs the English title with the single Arabic map", () => {
		expect(taskCategoryLabel("REPLACEMENT")).toBe(
			bilingual("Replacement", "استبدال"),
		);
		expect(taskCategoryLabel("FOLLOW_UP")).toBe(
			bilingual("FOLLOW_UP", "متابعة"),
		);
	});
});
