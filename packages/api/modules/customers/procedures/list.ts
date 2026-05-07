import {
	getDealerScopeFilter,
	getOwnershipFilterAsync,
	requirePermission,
} from "@repo/api/lib/permission";
import { db, type Prisma } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { CUSTOMER_LIST_STATUSES } from "../lib/statuses";

export const listCustomers = protectedProcedure
	.route({
		method: "GET",
		path: "/customers",
		tags: ["Customers"],
		summary: "List customers with pagination, search, and filters",
	})
	.input(
		z.object({
			organizationId: z.string(),
			search: z.string().optional(),
			status: z.enum(CUSTOMER_LIST_STATUSES).optional(),
			planId: z.string().optional(),
			stationId: z.string().optional(),
			connectionType: z
				.enum(["FIBER", "WIRELESS", "DSL", "CABLE", "ETHERNET"])
				.optional(),
			groupName: z.string().optional(),
			collectorId: z.string().optional(),
			hasLocation: z.enum(["yes", "no"]).optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(10).max(100).default(25),
			sortBy: z
				.enum([
					"lastName",
					"accountNumber",
					"createdAt",
					"status",
					"balance",
					"monthlyRate",
					"username",
					"expiresAt",
				])
				.default("createdAt"),
			sortOrder: z.enum(["asc", "desc"]).default("desc"),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"read",
		);

		const ownerFilter = await getOwnershipFilterAsync(
			permCtx,
			"customers",
			"read",
		);

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
			...ownerFilter,
			...getDealerScopeFilter(activeDealerId),
		};

		if (input.status === "EXPIRED") {
			where["status"] = "ACTIVE";
			where["expiresAt"] = { lt: new Date() };
		} else if (input.status === "ONLINE") {
			where["status"] = "ACTIVE";
			where["online"] = true;
		} else if (input.status === "OFFLINE") {
			where["status"] = "ACTIVE";
			where["online"] = false;
		} else if (input.status === "NEEDS_REVIEW") {
			where["notes"] = { not: "" };
		} else if (input.status) {
			where["status"] = input.status;
		}
		if (input.planId) {
			where["planId"] = input.planId;
		}
		if (input.stationId) {
			where["stationId"] = input.stationId;
		}
		if (input.connectionType) {
			where["connectionType"] = input.connectionType;
		}
		if (input.groupName) {
			where["groupName"] = input.groupName;
		}
		if (input.collectorId === "none") {
			where["collectorId"] = null;
		} else if (input.collectorId) {
			where["collectorId"] = input.collectorId;
		}
		if (input.hasLocation === "yes") {
			where["AND"] = [
				...((where["AND"] as unknown[] | undefined) ?? []),
				{ latitude: { not: null } },
				{ longitude: { not: null } },
			];
		} else if (input.hasLocation === "no") {
			where["AND"] = [
				...((where["AND"] as unknown[] | undefined) ?? []),
				{ OR: [{ latitude: null }, { longitude: null }] },
			];
		}
		if (input.search) {
			const tokens = input.search
				.trim()
				.split(/\s+/)
				.filter(Boolean)
				.slice(0, 10);
			const nameClauses: Prisma.CustomerWhereInput[] =
				tokens.length > 1
					? [
							{
								AND: tokens.map((token) => ({
									OR: [
										{
											firstName: {
												contains: token,
												mode: "insensitive",
											},
										},
										{
											lastName: {
												contains: token,
												mode: "insensitive",
											},
										},
									],
								})),
							},
						]
					: [
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
						];
			where["OR"] = [
				...nameClauses,
				{ email: { contains: input.search, mode: "insensitive" } },
				{ phone: { contains: input.search, mode: "insensitive" } },
				{ mobile: { contains: input.search, mode: "insensitive" } },
				{
					accountNumber: {
						contains: input.search,
						mode: "insensitive",
					},
				},
				{ username: { contains: input.search, mode: "insensitive" } },
				{ groupName: { contains: input.search, mode: "insensitive" } },
				{ address: { contains: input.search, mode: "insensitive" } },
				{ ipAddress: { contains: input.search, mode: "insensitive" } },
				{ macAddress: { contains: input.search, mode: "insensitive" } },
				{ externalId: { contains: input.search, mode: "insensitive" } },
				{ notes: { contains: input.search, mode: "insensitive" } },
				{ mof: { contains: input.search, mode: "insensitive" } },
				{
					plan: {
						name: { contains: input.search, mode: "insensitive" },
					},
				},
				{
					station: {
						name: { contains: input.search, mode: "insensitive" },
					},
				},
				{
					collector: {
						name: { contains: input.search, mode: "insensitive" },
					},
				},
			];
		}

		const [customers, total] = await Promise.all([
			db.customer.findMany({
				where,
				select: {
					id: true,
					accountNumber: true,
					username: true,
					firstName: true,
					lastName: true,
					email: true,
					phone: true,
					mobile: true,
					phones: true,
					status: true,
					online: true,
					connectionType: true,
					ipAddress: true,
					monthlyRate: true,
					groupName: true,
					balance: true,
					expiresAt: true,
					notes: true,
					externalId: true,
					latitude: true,
					longitude: true,
					locationRequestedAt: true,
					createdAt: true,
					plan: {
						select: {
							id: true,
							name: true,
							monthlyPrice: true,
						},
					},
					station: {
						select: {
							id: true,
							name: true,
						},
					},
					collector: {
						select: {
							id: true,
							name: true,
						},
					},
				},
				orderBy: { [input.sortBy]: input.sortOrder },
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
			}),
			db.customer.count({ where }),
		]);

		return {
			customers,
			total,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});
