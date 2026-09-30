import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, calls, existingJob, queue } = vi.hoisted(() => {
	const calls: string[] = [];
	const existingJob = {
		remove: vi.fn(async () => {
			calls.push("remove");
		}),
	};
	return {
		findUnique: vi.fn(),
		calls,
		existingJob,
		queue: {
			getJob: vi.fn(async () => existingJob),
			add: vi.fn(async () => {
				calls.push("add");
			}),
		},
	};
});
vi.mock("@repo/database", () => ({ db: { task: { findUnique } } }));
vi.mock("@repo/logs", () => ({ logger: { debug: vi.fn() } }));
vi.mock("../../queues/task-reminder.queue", () => ({
	getTaskReminderQueue: () => queue,
}));

import { scheduleTaskReminder, taskReminderJobId } from "../task-reminder.jobs";

function task(overrides: Record<string, unknown> = {}) {
	return {
		status: "OPEN",
		dueDate: new Date(Date.now() + 2 * 60 * 60_000),
		dueHasTime: true,
		reminderSentAt: null,
		organization: {
			notifyWorkerOnTaskReminder: true,
			taskReminderLeadMinutes: 30,
		},
		_count: { assignments: 1 },
		...overrides,
	};
}

describe("scheduleTaskReminder", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		calls.length = 0;
	});

	it("uses a job id without ':' (BullMQ rejects it)", () => {
		expect(taskReminderJobId("cm1abc")).toBe("task-reminder-cm1abc");
		expect(taskReminderJobId("cm1abc")).not.toContain(":");
	});

	it("removes the old job before adding, delayed to due − lead", async () => {
		findUnique.mockResolvedValue(task());
		await scheduleTaskReminder("t1");
		expect(calls).toEqual(["remove", "add"]);
		const [, data, opts] = queue.add.mock.calls[0] as unknown as [
			string,
			{ taskId: string },
			{ jobId: string; delay: number },
		];
		expect(data.taskId).toBe("t1");
		expect(opts.jobId).toBe("task-reminder-t1");
		// 2h out, 30 min lead → ~90 min delay
		expect(opts.delay).toBeGreaterThan(89 * 60_000);
		expect(opts.delay).toBeLessThanOrEqual(90 * 60_000);
	});

	it("sends immediately when created inside the lead window", async () => {
		findUnique.mockResolvedValue(
			task({ dueDate: new Date(Date.now() + 10 * 60_000) }),
		);
		await scheduleTaskReminder("t1");
		const opts = (
			queue.add.mock.calls[0] as unknown as [
				string,
				unknown,
				{ delay: number },
			]
		)[2];
		expect(opts.delay).toBe(0);
	});

	it("queues nothing when the due time already passed", async () => {
		findUnique.mockResolvedValue(
			task({ dueDate: new Date(Date.now() - 10 * 60_000) }),
		);
		await scheduleTaskReminder("t1");
		expect(queue.add).not.toHaveBeenCalled();
	});

	it("queues nothing for date-only, closed, unassigned or reminded tasks", async () => {
		for (const overrides of [
			{ dueHasTime: false },
			{ status: "COMPLETED" },
			{ _count: { assignments: 0 } },
			{ reminderSentAt: new Date() },
			{ dueDate: null },
		]) {
			findUnique.mockResolvedValue(task(overrides));
			await scheduleTaskReminder("t1");
		}
		expect(queue.add).not.toHaveBeenCalled();
		// Still cancels any stale job each time.
		expect(existingJob.remove).toHaveBeenCalledTimes(5);
	});
});
