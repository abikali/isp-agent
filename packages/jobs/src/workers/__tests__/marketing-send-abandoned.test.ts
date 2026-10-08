import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findUnique: vi.fn(),
	update: vi.fn(),
	updateMany: vi.fn(),
	count: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: {
		marketingBroadcast: {
			findUnique: mocks.findUnique,
			update: mocks.update,
		},
		marketingBroadcastRecipient: {
			updateMany: mocks.updateMany,
			count: mocks.count,
		},
	},
}));
vi.mock("@repo/logs", () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("@repo/ai", () => ({ decryptToken: vi.fn() }));
vi.mock("@repo/integrations", () => ({
	createSaltiClient: vi.fn(),
	SaltiApiError: class extends Error {},
}));
vi.mock("../../connection", () => ({ getRedisConnection: vi.fn() }));

import { closeAbandonedBroadcast } from "../marketing-send.worker";

describe("closeAbandonedBroadcast", () => {
	beforeEach(() => {
		for (const m of Object.values(mocks)) {
			m.mockReset();
		}
	});

	it("marks unsent recipients failed and closes a running broadcast", async () => {
		mocks.findUnique.mockResolvedValue({ status: "running" });
		mocks.updateMany.mockResolvedValue({ count: 1728 });
		mocks.count.mockResolvedValueOnce(580).mockResolvedValueOnce(1728);

		await closeAbandonedBroadcast(
			"b1",
			"job stalled more than allowable limit",
		);

		expect(mocks.updateMany).toHaveBeenCalledWith({
			where: { broadcastId: "b1", status: "queued" },
			data: {
				status: "failed",
				errorMessage: "Not sent: job stalled more than allowable limit",
			},
		});
		expect(mocks.update.mock.calls[0]?.[0].data).toMatchObject({
			status: "completed",
			sentCount: 580,
			failedCount: 1728,
		});
	});

	it("leaves finished or cancelled broadcasts alone", async () => {
		mocks.findUnique.mockResolvedValue({ status: "cancelled" });
		await closeAbandonedBroadcast("b1", "x");
		expect(mocks.updateMany).not.toHaveBeenCalled();
		expect(mocks.update).not.toHaveBeenCalled();
	});
});
