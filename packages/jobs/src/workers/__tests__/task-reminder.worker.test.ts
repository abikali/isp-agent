import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, updateMany, queueTelegramNotify } = vi.hoisted(() => ({
	findUnique: vi.fn(),
	updateMany: vi.fn(),
	queueTelegramNotify: vi.fn(async () => "job"),
}));
vi.mock("@repo/database", () => ({
	db: { task: { findUnique, updateMany } },
	parsePhones: () => [{ number: "70123456" }],
}));
vi.mock("@repo/logs", () => ({ logger: { warn: vi.fn() } }));
vi.mock("bullmq", () => ({ Worker: class {} }));
vi.mock("../../connection", () => ({ getRedisConnection: vi.fn(() => ({})) }));
vi.mock("../../queues/task-reminder.queue", () => ({
	TASK_REMINDER_QUEUE_NAME: "task-reminder",
}));
vi.mock("../../jobs/telegram-notify.jobs", () => ({ queueTelegramNotify }));

import { processTaskReminder } from "../task-reminder.worker";

const dueDate = new Date(Date.now() + 30 * 60_000);

function task(overrides: Record<string, unknown> = {}) {
	return {
		id: "t1",
		organizationId: "org-1",
		title: "Installation — Samir · AB12",
		status: "OPEN",
		dueDate,
		dueHasTime: true,
		reminderSentAt: null,
		notes: null,
		organization: { slug: "abiroot", notifyWorkerOnTaskReminder: true },
		customer: {
			firstName: "Samir",
			lastName: null,
			username: "samirhalabe",
			accountNumber: null,
			address: null,
			phones: [],
			mobile: null,
			phone: null,
		},
		base: null,
		station: null,
		assignments: [
			{
				employee: {
					id: "emp-1",
					userId: "user-1",
					telegramChatId: "123",
					preferredLayout: "worker",
				},
			},
		],
		...overrides,
	};
}

const data = { taskId: "t1", dueAt: dueDate.toISOString() };

describe("processTaskReminder", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		updateMany.mockResolvedValue({ count: 1 });
	});

	it("claims the task and reminds each assignee once", async () => {
		findUnique.mockResolvedValue(task());
		const notifyUser = vi.fn(async () => {});
		const result = await processTaskReminder(data, { notifyUser });
		expect(result).toEqual({ sent: 1 });
		expect(updateMany).toHaveBeenCalledWith({
			where: { id: "t1", reminderSentAt: null, dueDate },
			data: { reminderSentAt: expect.any(Date) },
		});
		expect(notifyUser).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "user-1",
				link: "/work/abiroot/tasks?task=t1",
			}),
		);
		expect(queueTelegramNotify).toHaveBeenCalledTimes(1);
		const [payload] = queueTelegramNotify.mock.calls[0] as unknown as [
			{ text: string; parseMode: string },
		];
		expect(payload.parseMode).toBe("HTML");
		expect(payload.text).toContain("⏰");
		expect(payload.text).toContain("samirhalabe");
	});

	it("skips a stale job whose due time was changed", async () => {
		findUnique.mockResolvedValue(
			task({ dueDate: new Date(dueDate.getTime() + 60 * 60_000) }),
		);
		const result = await processTaskReminder(data);
		expect(result.skipped).toBe("stale");
		expect(updateMany).not.toHaveBeenCalled();
		expect(queueTelegramNotify).not.toHaveBeenCalled();
	});

	it("skips cancelled and completed tasks", async () => {
		for (const status of ["CANCELLED", "COMPLETED", "PENDING_APPROVAL"]) {
			findUnique.mockResolvedValue(task({ status }));
			const result = await processTaskReminder(data);
			expect(result.skipped).toBe("inactive");
		}
		expect(queueTelegramNotify).not.toHaveBeenCalled();
	});

	it("skips when the reminder was already sent", async () => {
		findUnique.mockResolvedValue(task({ reminderSentAt: new Date() }));
		const result = await processTaskReminder(data);
		expect(result.skipped).toBe("already_sent");
		expect(updateMany).not.toHaveBeenCalled();
	});

	it("sends nothing when a concurrent job won the claim", async () => {
		findUnique.mockResolvedValue(task());
		updateMany.mockResolvedValue({ count: 0 });
		const result = await processTaskReminder(data);
		expect(result).toEqual({ sent: 0, skipped: "already_sent" });
		expect(queueTelegramNotify).not.toHaveBeenCalled();
	});

	it("respects the org switch", async () => {
		findUnique.mockResolvedValue(
			task({
				organization: {
					slug: "abiroot",
					notifyWorkerOnTaskReminder: false,
				},
			}),
		);
		const result = await processTaskReminder(data);
		expect(result.skipped).toBe("disabled");
	});
});
