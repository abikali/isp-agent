import { db } from "@repo/database";
import z from "zod";
import { adminProcedure } from "../../../orpc/procedures";

export const getDealerLedger = adminProcedure
	.route({
		method: "GET",
		path: "/admin/dealers/{dealerId}/ledger",
		tags: ["Dealers"],
		summary: "Read-only dealer account ledger (admin only)",
	})
	.input(
		z.object({
			dealerId: z.string(),
			from: z.coerce.date().optional(),
			to: z.coerce.date().optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(10).max(100).default(50),
		}),
	)
	.handler(async ({ input }) => {
		const where: Record<string, unknown> = { dealerId: input.dealerId };
		if (input.from || input.to) {
			where["operationDate"] = {
				...(input.from ? { gte: input.from } : {}),
				...(input.to ? { lte: input.to } : {}),
			};
		}

		const [entries, total, totals] = await Promise.all([
			db.ispDealerAccount.findMany({
				where,
				orderBy: { operationDate: "desc" },
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
			}),
			db.ispDealerAccount.count({ where }),
			db.ispDealerAccount.aggregate({
				where: { dealerId: input.dealerId },
				_sum: { credit: true, debit: true },
			}),
		]);

		return {
			entries,
			total,
			totalCredit: totals._sum.credit ?? 0,
			totalDebit: totals._sum.debit ?? 0,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});
