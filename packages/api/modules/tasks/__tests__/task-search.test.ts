import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/database", () => ({
	db: { $queryRaw: vi.fn() },
}));

import { db } from "@repo/database";
import { customerTokenWhere } from "../../customers/lib/customer-search";
import { taskSearchWhere, taskTokenWhere } from "../lib/task-search";

const mockQueryRaw = vi.mocked(db.$queryRaw);

beforeEach(() => {
	mockQueryRaw.mockReset();
});

function orKeys(where: { OR?: unknown }): string[] {
	return ((where.OR as object[] | undefined) ?? []).map(
		(c) => Object.keys(c)[0] ?? "",
	);
}

describe("taskTokenWhere", () => {
	it("matches a name token on task text, customer, base, station and workers", () => {
		const where = taskTokenWhere("takla");
		expect(orKeys(where)).toEqual([
			"title",
			"description",
			"notes",
			"customer",
			"base",
			"station",
			"assignments",
			"completedByEmployee",
		]);
		expect(where.OR).toContainEqual({
			customer: customerTokenWhere("takla"),
		});
		expect(where.OR).toContainEqual({
			assignments: {
				some: {
					employee: {
						name: { contains: "takla", mode: "insensitive" },
					},
				},
			},
		});
	});

	it("matches a 4-character token against the task code (id suffix)", () => {
		const where = taskTokenWhere("7K2M");
		expect(where.OR).toContainEqual({ id: { endsWith: "7k2m" } });
	});

	it("keeps a single character to the task's own text", () => {
		expect(orKeys(taskTokenWhere("x"))).toEqual([
			"title",
			"description",
			"notes",
		]);
	});
});

describe("taskSearchWhere", () => {
	it("returns null for a blank query", async () => {
		expect(await taskSearchWhere("org-1", "   ")).toBeNull();
		expect(await taskSearchWhere("org-1", "#")).toBeNull();
	});

	it("ANDs every token so first + last name both have to match", async () => {
		const where = await taskSearchWhere("org-1", "michell  takla");
		expect(mockQueryRaw).not.toHaveBeenCalled();
		expect(where).toEqual({
			AND: [taskTokenWhere("michell"), taskTokenWhere("takla")],
		});
	});

	it("drops a leading # so the synced title number matches", async () => {
		const where = await taskSearchWhere("org-1", "#2907");
		expect(where).toEqual({ AND: [taskTokenWhere("2907")] });
	});

	it("keeps an account number as one token", async () => {
		const where = await taskSearchWhere("org-1", "ACC-00097");
		expect(where).toEqual({ AND: [taskTokenWhere("ACC-00097")] });
	});

	it.each([
		"81394966",
		"81 394 966",
		"+96181692313",
	])("resolves phone %s through the customer's numbers", async (q) => {
		mockQueryRaw.mockResolvedValue([{ id: "c97" }] as never);

		const where = await taskSearchWhere("org-1", q);

		expect(mockQueryRaw).toHaveBeenCalledTimes(1);
		expect(where).toEqual({
			OR: [
				{ title: { contains: q, mode: "insensitive" } },
				{ description: { contains: q, mode: "insensitive" } },
				{ notes: { contains: q, mode: "insensitive" } },
				{
					customer: {
						OR: [
							{ id: { in: ["c97"] } },
							{ username: { contains: q, mode: "insensitive" } },
							{
								accountNumber: {
									contains: q,
									mode: "insensitive",
								},
							},
						],
					},
				},
			],
		});
	});
});
