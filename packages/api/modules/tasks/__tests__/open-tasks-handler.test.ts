import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockVerifyApiKey } = vi.hoisted(() => ({
	mockDb: {
		organization: { findUnique: vi.fn() },
		customer: { findFirst: vi.fn(), findMany: vi.fn() },
		task: { findMany: vi.fn() },
	},
	mockVerifyApiKey: vi.fn(),
}));

vi.mock("@repo/database", () => ({ db: mockDb }));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../api-keys/lib/verify", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../../api-keys/lib/verify")>();
	return { ...actual, verifyApiKey: mockVerifyApiKey };
});

import { openTasksHandler } from "../lib/open-tasks-handler";

const ORG_ID = "org-1";

function request(query: string, key = "libancom_test"): Request {
	return new Request(
		`https://cp.example.com/api/task-ingest/liban-com/open-tasks?${query}`,
		{ headers: { "x-api-key": key } },
	);
}

function validKey(permissions: string[]) {
	mockVerifyApiKey.mockResolvedValue({
		valid: true,
		apiKey: {
			id: "key-1",
			name: "tg bot",
			organizationId: ORG_ID,
			permissions,
			createdById: "user-1",
		},
	});
}

function task(id: string, title: string, worker: string) {
	return {
		id,
		title,
		category: "MAINTENANCE",
		status: "OPEN",
		createdAt: new Date("2026-09-28T10:00:00Z"),
		assignments: [{ employee: { username: worker, name: "Marwan" } }],
	};
}

function customer(overrides: Record<string, unknown> = {}) {
	return {
		id: "c1",
		username: "maherbaghdassarian",
		firstName: "Maher",
		lastName: "Baghdassarian",
		mikrotikInterface: "(VM-PPPoe4)-vlan2032-zone4-olt1-PON4-samirhalabe",
		accessPointId: null,
		...overrides,
	};
}

describe("openTasksHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.organization.findUnique.mockResolvedValue({ id: ORG_ID });
		mockDb.task.findMany.mockResolvedValue([]);
		mockDb.customer.findMany.mockResolvedValue([]);
	});

	it("401s an invalid key", async () => {
		mockVerifyApiKey.mockResolvedValue({ valid: false, error: "nope" });
		const res = await openTasksHandler(
			request("customer_username=x"),
			"liban-com",
		);
		expect(res.status).toBe(401);
	});

	it("403s a key without write:tasks", async () => {
		validKey(["read:customers"]);
		const res = await openTasksHandler(
			request("customer_username=x"),
			"liban-com",
		);
		expect(res.status).toBe(403);
	});

	it("404s a deleted or unknown customer (lookup excludes deleted rows)", async () => {
		validKey(["write:*"]);
		mockDb.customer.findFirst.mockResolvedValue(null);
		const res = await openTasksHandler(
			request("customer_username=gone"),
			"liban-com",
		);
		expect(res.status).toBe(404);
		expect(mockDb.customer.findFirst.mock.calls[0]?.[0].where).toEqual({
			organizationId: ORG_ID,
			username: "gone",
			deletedAt: null,
		});
	});

	it("returns open field tasks with the web notice's filter", async () => {
		validKey(["write:tasks"]);
		mockDb.customer.findFirst.mockResolvedValue(customer());
		mockDb.task.findMany.mockResolvedValue([
			task("t1", "Maintenance: maherbaghdassarian", "wmarwan"),
		]);
		const res = await openTasksHandler(
			request("customer_username=maherbaghdassarian"),
			"liban-com",
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.customer).toEqual({
			username: "maherbaghdassarian",
			name: "Maher Baghdassarian",
		});
		expect(body.openTasks).toEqual([
			{
				id: "t1",
				title: "Maintenance: maherbaghdassarian",
				category: "MAINTENANCE",
				status: "OPEN",
				createdAt: "2026-09-28T10:00:00.000Z",
				assignees: ["wmarwan"],
			},
		]);
		const where = mockDb.task.findMany.mock.calls[0]?.[0].where;
		// COMPLETED and AI_ESCALATION/SYSTEM tasks are excluded.
		expect(where.status).toEqual({ in: ["OPEN", "PENDING_APPROVAL"] });
		expect(where.source).toEqual({ in: ["MANUAL", "LEGACY"] });
	});

	it("finds same-box neighbours by building interface", async () => {
		validKey(["write:tasks"]);
		mockDb.customer.findFirst.mockResolvedValue(customer());
		mockDb.customer.findMany.mockResolvedValue([
			{
				username: "samirhalabe",
				firstName: "Samir",
				lastName: null,
				tasks: [task("t2", "Maintenance: samirhalabe", "wtaktak")],
			},
		]);
		const res = await openTasksHandler(
			request("customer_username=maherbaghdassarian"),
			"liban-com",
		);
		const body = await res.json();
		expect(body.sameBox).toEqual([
			{
				username: "samirhalabe",
				name: "Samir",
				tasks: [
					{
						title: "Maintenance: samirhalabe",
						status: "OPEN",
						assignees: ["wtaktak"],
					},
				],
			},
		]);
		const where = mockDb.customer.findMany.mock.calls[0]?.[0].where;
		expect(where.OR).toEqual([
			{
				mikrotikInterface:
					"(VM-PPPoe4)-vlan2032-zone4-olt1-PON4-samirhalabe",
			},
		]);
		expect(where.id).toEqual({ not: "c1" });
		expect(where.deletedAt).toBeNull();
	});

	it("finds same-box neighbours by access point", async () => {
		validKey(["write:tasks"]);
		mockDb.customer.findFirst.mockResolvedValue(
			customer({ mikrotikInterface: null, accessPointId: "ap-1" }),
		);
		await openTasksHandler(
			request("customer_username=maherbaghdassarian"),
			"liban-com",
		);
		const where = mockDb.customer.findMany.mock.calls[0]?.[0].where;
		expect(where.OR).toEqual([{ accessPointId: "ap-1" }]);
	});

	it("ignores per-user PPPoE interfaces for same-box matching", async () => {
		validKey(["write:tasks"]);
		mockDb.customer.findFirst.mockResolvedValue(
			customer({ mikrotikInterface: "<pppoe-maherbaghdassarian>" }),
		);
		const res = await openTasksHandler(
			request("customer_username=maherbaghdassarian"),
			"liban-com",
		);
		expect(mockDb.customer.findMany).not.toHaveBeenCalled();
		expect((await res.json()).sameBox).toEqual([]);
	});
});
