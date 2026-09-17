import {
	getDealerScopeFilter,
	getOwnershipFilterAsync,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listInstallations = protectedProcedure
	.route({
		method: "GET",
		path: "/installations",
		tags: ["Installations"],
		summary: "List installations with filters",
	})
	.input(
		z.object({
			organizationId: z.string(),
			status: z
				.enum(["PENDING", "APPROVED", "COMPLETED", "DENIED"])
				.optional(),
			employeeId: z.string().optional(),
			customerId: z.string().optional(),
			stationId: z.string().optional(),
			baseId: z.string().optional(),
			stockItemId: z.string().optional(),
			isAddOn: z.boolean().optional(),
			// item = physical stock on a customer; station = station install;
			// base = base install; addon = IPTV / Real IP
			type: z.enum(["item", "station", "base", "addon"]).optional(),
			search: z.string().optional(),
			priceMin: z.number().optional(),
			priceMax: z.number().optional(),
			qtyMin: z.number().int().optional(),
			qtyMax: z.number().int().optional(),
			from: z.coerce.date().optional(),
			to: z.coerce.date().optional(),
			sortBy: z.enum(["installedAt", "price", "quantity"]).optional(),
			sortOrder: z.enum(["asc", "desc"]).optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(10).max(100).default(30),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"installations",
			"read",
		);

		const ownershipFilter = await getOwnershipFilterAsync(
			permCtx,
			"installations",
			"read",
		);

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
			employee: getDealerScopeFilter(activeDealerId),
			...ownershipFilter,
		};
		if (input.status) {
			where["status"] = input.status;
		}
		if (input.employeeId) {
			where["employeeId"] = input.employeeId;
		}
		if (input.customerId) {
			where["customerId"] = input.customerId;
		}
		if (input.stationId) {
			where["stationId"] = input.stationId;
		}
		if (input.baseId) {
			where["baseId"] = input.baseId;
		}
		if (input.stockItemId) {
			where["stockItemId"] = input.stockItemId;
		}
		if (input.isAddOn !== undefined) {
			where["isAddOn"] = input.isAddOn;
		}
		if (input.type === "addon") {
			where["isAddOn"] = true;
		} else if (input.type === "station") {
			where["stationId"] = { not: null };
		} else if (input.type === "base") {
			where["baseId"] = { not: null };
		} else if (input.type === "item") {
			// Physical stock landed on a customer (not a station / base / add-on)
			where["isAddOn"] = false;
			where["stationId"] = null;
			where["baseId"] = null;
		}
		if (input.priceMin !== undefined || input.priceMax !== undefined) {
			where["price"] = {
				...(input.priceMin !== undefined
					? { gte: input.priceMin }
					: {}),
				...(input.priceMax !== undefined
					? { lte: input.priceMax }
					: {}),
			};
		}
		if (input.qtyMin !== undefined || input.qtyMax !== undefined) {
			where["quantity"] = {
				...(input.qtyMin !== undefined ? { gte: input.qtyMin } : {}),
				...(input.qtyMax !== undefined ? { lte: input.qtyMax } : {}),
			};
		}
		if (input.from || input.to) {
			where["installedAt"] = {
				...(input.from ? { gte: input.from } : {}),
				...(input.to ? { lte: input.to } : {}),
			};
		}
		if (input.search) {
			where["OR"] = [
				{
					customer: {
						OR: [
							{
								firstName: {
									contains: input.search,
									mode: "insensitive",
								},
							},
							{
								lastName: {
									contains: input.search,
									mode: "insensitive",
								},
							},
							{
								username: {
									contains: input.search,
									mode: "insensitive",
								},
							},
						],
					},
				},
				{
					stockItem: {
						name: { contains: input.search, mode: "insensitive" },
					},
				},
				{
					station: {
						name: { contains: input.search, mode: "insensitive" },
					},
				},
				{
					base: {
						name: { contains: input.search, mode: "insensitive" },
					},
				},
				{ notes: { contains: input.search, mode: "insensitive" } },
			];
		}

		const [installations, total] = await Promise.all([
			db.installation.findMany({
				where,
				include: {
					customer: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
							username: true,
							accountNumber: true,
							address: true,
						},
					},
					station: { select: { id: true, name: true } },
					base: { select: { id: true, name: true } },
					employee: { select: { id: true, name: true } },
					stockItem: { select: { id: true, name: true } },
					approvedBy: { select: { id: true, name: true } },
					// A line of a still-pending setup request is approved with the
					// request (New Customers), never on its own.
					setupRequest: { select: { status: true } },
					// Completion evidence (photo + worker's resolution note) lives
					// on the task, not the installation row itself.
					task: {
						select: {
							id: true,
							title: true,
							completionPhotoUrl: true,
							completedAt: true,
							resolutionCode: true,
							resolutionNote: true,
						},
					},
				},
				orderBy: {
					[input.sortBy ?? "installedAt"]: input.sortOrder ?? "desc",
				},
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
			}),
			db.installation.count({ where }),
		]);

		// Stock context for pending physical lines so the review screen can cap
		// quantity edits and disable Approve before the server refuses: what
		// the worker holds, and how much of it his OTHER pending lines and
		// refund requests already reserve (same rule as the stock guard).
		const pendingPhysical = installations.filter(
			(i) => i.status === "PENDING" && !i.isAddOn && i.stockItemId,
		);
		const stockByPair = new Map<
			string,
			{ held: number; pendingInstalls: number; pendingRefunds: number }
		>();
		if (pendingPhysical.length > 0) {
			const employeeIds = [
				...new Set(pendingPhysical.map((i) => i.employeeId)),
			];
			const stockItemIds = [
				...new Set(pendingPhysical.map((i) => i.stockItemId as string)),
			];
			const [holdings, installSums, refundSums] = await Promise.all([
				db.workerStock.findMany({
					where: {
						employeeId: { in: employeeIds },
						stockItemId: { in: stockItemIds },
					},
					select: {
						employeeId: true,
						stockItemId: true,
						quantity: true,
					},
				}),
				db.installation.groupBy({
					by: ["employeeId", "stockItemId"],
					where: {
						employeeId: { in: employeeIds },
						stockItemId: { in: stockItemIds },
						status: "PENDING",
						isAddOn: false,
						externalBillingId: null,
					},
					_sum: { quantity: true },
				}),
				db.stockRefundRequest.groupBy({
					by: ["employeeId", "stockItemId"],
					where: {
						employeeId: { in: employeeIds },
						stockItemId: { in: stockItemIds },
						status: "PENDING",
					},
					_sum: { quantity: true },
				}),
			]);
			const entry = (employeeId: string, stockItemId: string | null) => {
				const key = `${employeeId}:${stockItemId}`;
				const existing = stockByPair.get(key);
				if (existing) {
					return existing;
				}
				const created = {
					held: 0,
					pendingInstalls: 0,
					pendingRefunds: 0,
				};
				stockByPair.set(key, created);
				return created;
			};
			for (const h of holdings) {
				entry(h.employeeId, h.stockItemId).held = h.quantity;
			}
			for (const row of installSums) {
				entry(row.employeeId, row.stockItemId).pendingInstalls =
					row._sum.quantity ?? 0;
			}
			for (const row of refundSums) {
				entry(row.employeeId, row.stockItemId).pendingRefunds =
					row._sum.quantity ?? 0;
			}
		}

		return {
			installations: installations.map((i) => {
				const pair =
					i.status === "PENDING" && !i.isAddOn && i.stockItemId
						? stockByPair.get(`${i.employeeId}:${i.stockItemId}`)
						: undefined;
				const ownReserved =
					i.externalBillingId === null ? i.quantity : 0;
				return {
					...i,
					stock: pair
						? {
								held: pair.held,
								reservedByOthers:
									Math.max(
										0,
										pair.pendingInstalls - ownReserved,
									) + pair.pendingRefunds,
							}
						: null,
				};
			}),
			total,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});
