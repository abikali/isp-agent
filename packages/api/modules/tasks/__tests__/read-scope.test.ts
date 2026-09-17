import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/database", () => ({
	db: {
		employee: { findFirst: vi.fn() },
	},
}));

import { db } from "@repo/database";
import type { PermissionContext } from "../../../lib/permission";
import { taskOwnScopeWhere } from "../lib/read-scope";

const mockFindEmployee = vi.mocked(db.employee.findFirst);

const base = { userId: "user-1", organizationId: "org-1" };
const worker = {
	...base,
	memberRole: "worker" as PermissionContext["memberRole"],
	rolePermissions: { tasks: ["read:own"] },
};

beforeEach(() => {
	mockFindEmployee.mockReset();
});

describe("taskOwnScopeWhere", () => {
	it("is null when the role reads every task", async () => {
		expect(
			await taskOwnScopeWhere({ ...base, memberRole: "admin" }),
		).toBeNull();
		expect(mockFindEmployee).not.toHaveBeenCalled();
	});

	it("limits read:own to created or assigned tasks", async () => {
		mockFindEmployee.mockResolvedValue({ id: "emp-1" } as never);
		expect(await taskOwnScopeWhere(worker)).toEqual({
			OR: [
				{ createdById: "user-1" },
				{ assignments: { some: { employeeId: "emp-1" } } },
			],
		});
	});

	it("falls back to created-by only without an employee record", async () => {
		mockFindEmployee.mockResolvedValue(null);
		expect(await taskOwnScopeWhere(worker)).toEqual({
			OR: [{ createdById: "user-1" }],
		});
	});
});
