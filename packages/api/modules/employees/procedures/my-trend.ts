import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { getUserEmployeeId } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Month-by-month activity trend for the logged-in field employee, for the
 * worker-portal Tasks chart. Membership-scoped (same model as `myStats`),
 * zero-filled across the requested window (3 / 6 / 12 months).
 */
export const getMyWorkerTrend = protectedProcedure
	.route({
		method: "GET",
		path: "/employees/my-trend",
		tags: ["Employees"],
		summary: "Monthly activity trend for the current employee",
	})
	.input(
		z.object({
			organizationId: z.string(),
			months: z
				.union([z.literal(3), z.literal(6), z.literal(12)])
				.default(12),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const member = await verifyOrganizationMembership(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		const employeeId = await getUserEmployeeId(
			input.organizationId,
			user.id,
		);
		if (!employeeId) {
			throw new ORPCError("FORBIDDEN", {
				message: "No employee record linked to your account",
			});
		}

		const now = new Date();
		const windowStart = new Date(
			Date.UTC(
				now.getUTCFullYear(),
				now.getUTCMonth() - (input.months - 1),
				1,
			),
		);
		const org = input.organizationId;

		const [completedTasks, signUps] = await Promise.all([
			db.task.findMany({
				where: {
					organizationId: org,
					status: "COMPLETED",
					completedAt: { gte: windowStart },
					assignments: { some: { employeeId } },
				},
				select: { completedAt: true },
			}),
			// Same population as the "New users" KPI and the month customer
			// list: requests he raised, minus the rejected ones.
			db.customerSetupRequest.findMany({
				where: {
					organizationId: org,
					requestedById: employeeId,
					createdAt: { gte: windowStart },
					status: { in: ["PENDING", "APPROVED"] },
				},
				select: { createdAt: true },
			}),
		]);

		const monthKey = (d: Date) =>
			`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

		const trendMap = new Map<
			string,
			{
				month: string;
				label: string;
				completed: number;
				newUsers: number;
			}
		>();
		for (let i = 0; i < input.months; i++) {
			const d = new Date(
				Date.UTC(
					windowStart.getUTCFullYear(),
					windowStart.getUTCMonth() + i,
					1,
				),
			);
			trendMap.set(monthKey(d), {
				month: monthKey(d),
				label: d.toLocaleDateString("en-US", {
					month: "short",
					timeZone: "UTC",
				}),
				completed: 0,
				newUsers: 0,
			});
		}

		for (const t of completedTasks) {
			if (!t.completedAt) {
				continue;
			}
			const bucket = trendMap.get(monthKey(t.completedAt));
			if (bucket) {
				bucket.completed += 1;
			}
		}
		for (const signUp of signUps) {
			const bucket = trendMap.get(monthKey(signUp.createdAt));
			if (bucket) {
				bucket.newUsers += 1;
			}
		}

		return { trend: [...trendMap.values()] };
	});
