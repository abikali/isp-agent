import { describe, expect, it } from "vitest";
import { buildTaskTelegramText, taskLinkFor } from "../task-message";

const task = {
	title: "Installation — Samir · AB12",
	dueDate: new Date("2026-09-30T11:30:00Z"),
	dueHasTime: true,
	notes: "Bring a <long> cable",
	customer: {
		firstName: "Samir",
		lastName: "Halabi",
		username: "samirhalabe",
		accountNumber: "1042",
		address: "Achrafieh",
	},
	base: null,
	station: null,
};

describe("buildTaskTelegramText", () => {
	it("prints the Beirut due time and escapes free text", () => {
		const text = buildTaskTelegramText({
			icon: "⏰",
			title: "Task due in 30 min",
			task,
			phones: ["70123456"],
			showTaskTitle: true,
			url: "https://app.example/work/abiroot/tasks?task=t1",
		});
		expect(text).toContain("30/09/2026 14:30");
		expect(text).toContain("Installation — Samir · AB12");
		expect(text).toContain("<code>samirhalabe</code>");
		expect(text).toContain("<code>70123456</code>");
		expect(text).toContain("Bring a &lt;long&gt; cable");
	});

	it("prints only the day for a date-only due value", () => {
		const text = buildTaskTelegramText({
			icon: "🛠️",
			title: "New task assigned",
			task: {
				...task,
				dueDate: new Date("2026-09-30T09:00:00Z"),
				dueHasTime: false,
			},
			phones: [],
			url: "https://app.example/x",
		});
		expect(text).toContain("30/09/2026");
		expect(text).not.toContain("12:00");
		// The title line is only for the reminder.
		expect(text).not.toContain("AB12");
	});
});

describe("taskLinkFor", () => {
	it("routes field workers to the portal", () => {
		expect(taskLinkFor("worker", "abiroot", "t1")).toBe(
			"/work/abiroot/tasks?task=t1",
		);
		expect(taskLinkFor(null, "abiroot", "t1")).toBe(
			"/app/abiroot/tasks/t1",
		);
	});
});
