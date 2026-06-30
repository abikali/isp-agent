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
				},
				orderBy: { installedAt: "desc" },
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
			}),
			db.installation.count({ where }),
		]);

		return {
			installations,
			total,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});
