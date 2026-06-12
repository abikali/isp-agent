import { ORPCError } from "@orpc/server";
import { notifyOrgForReview } from "@repo/api/lib/notify-employee";
import {
	getDealerScopeFilter,
	getUserEmployeeId,
	hasPermission,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { addonNoteFor, classifyAddonNote } from "../lib/addons";

const itemSchema = z
	.object({
		stockItemId: z.string().optional(),
		addonType: z.enum(["IPTV", "REAL_IP"]).optional(),
		quantity: z.number().int().min(1).default(1),
		price: z.number().min(0),
		notes: z.string().max(500).optional(),
	})
	.refine((v) => Boolean(v.stockItemId) !== Boolean(v.addonType), {
		message: "Each line must be either a stock item or an add-on",
	});

export const createInstallation = protectedProcedure
	.route({
		method: "POST",
		path: "/installations",
		tags: ["Installations"],
		summary:
			"Submit installation lines for a customer or station (pending admin approval)",
	})
	.input(
		z
			.object({
				organizationId: z.string(),
				customerId: z.string().optional(),
				stationId: z.string().optional(),
				employeeId: z.string().optional(),
				items: z.array(itemSchema).min(1).max(20),
			})
			.refine((v) => Boolean(v.customerId) !== Boolean(v.stationId), {
				message: "Target exactly one of customer or station",
			})
			.refine((v) => !v.stationId || v.items.every((i) => !i.addonType), {
				message: "Stations cannot receive add-ons",
			}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"installations",
			"create",
		);

		// Workers create for themselves; admins may submit for any employee
		const ownEmployeeId = await getUserEmployeeId(
			input.organizationId,
			user.id,
		);
		let employeeId = ownEmployeeId;
		if (input.employeeId && input.employeeId !== ownEmployeeId) {
			if (!hasPermission(permCtx, "installations", "approve")) {
				throw new ORPCError("FORBIDDEN", {
					message:
						"Only admins can submit installations for another worker",
				});
			}
			employeeId = input.employeeId;
		}
		if (!employeeId) {
			throw new ORPCError("FORBIDDEN", {
				message: "No employee record linked to your account",
			});
		}

		// Validate target
		if (input.customerId) {
			const customer = await db.customer.findFirst({
				where: {
					id: input.customerId,
					organizationId: input.organizationId,
					...getDealerScopeFilter(activeDealerId),
				},
				select: { id: true },
			});
			if (!customer) {
				throw new ORPCError("NOT_FOUND", {
					message: "Customer not found",
				});
			}
		}
		if (input.stationId) {
			const station = await db.station.findFirst({
				where: {
					id: input.stationId,
					organizationId: input.organizationId,
				},
				select: { id: true },
			});
			if (!station) {
				throw new ORPCError("NOT_FOUND", {
					message: "Station not found",
				});
			}
		}

		// Add-on caps: max 1 IPTV + 1 Real IP per customer (PENDING + APPROVED)
		const addonLines = input.items.filter((i) => i.addonType);
		if (addonLines.length > 0 && input.customerId) {
			const requested = addonLines.map((i) => i.addonType);
			if (new Set(requested).size !== requested.length) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Only one of each add-on type per request",
				});
			}
			const existingAddons = await db.installation.findMany({
				where: {
					organizationId: input.organizationId,
					customerId: input.customerId,
					isAddOn: true,
					status: { in: ["PENDING", "APPROVED"] },
				},
				select: { notes: true },
			});
			const existingTypes = new Set(
				existingAddons
					.map((a) => classifyAddonNote(a.notes))
					.filter(Boolean),
			);
			for (const line of addonLines) {
				if (line.addonType && existingTypes.has(line.addonType)) {
					throw new ORPCError("CONFLICT", {
						message: `Customer already has ${addonNoteFor(line.addonType)}`,
					});
				}
			}
		}

		// Soft stock check — advisory only; the hard guard runs at approval
		const stockLines = input.items.filter((i) => i.stockItemId);
		if (stockLines.length > 0) {
			const allocations = await db.workerStock.findMany({
				where: {
					employeeId,
					stockItemId: {
						in: stockLines.map((i) => i.stockItemId as string),
					},
				},
				select: { stockItemId: true, quantity: true },
			});
			const holdings = new Map(
				allocations.map((a) => [a.stockItemId, a.quantity]),
			);
			for (const line of stockLines) {
				const held = holdings.get(line.stockItemId as string) ?? 0;
				if (held < line.quantity) {
					throw new ORPCError("CONFLICT", {
						message:
							"You don't hold enough stock for one of the items — ask for a delivery first",
					});
				}
			}
		}

		const installations = await db.$transaction(
			input.items.map((line) =>
				db.installation.create({
					data: {
						organizationId: input.organizationId,
						customerId: input.customerId ?? null,
						stationId: input.stationId ?? null,
						employeeId: employeeId as string,
						stockItemId: line.stockItemId ?? null,
						quantity: line.quantity,
						price: line.price,
						isAddOn: Boolean(line.addonType),
						notes: line.addonType
							? addonNoteFor(line.addonType)
							: (line.notes ?? null),
					},
					include: {
						stockItem: { select: { name: true } },
						employee: { select: { name: true } },
					},
				}),
			),
		);

		const org = await db.organization.findFirst({
			where: { id: input.organizationId },
			select: { slug: true },
		});
		notifyOrgForReview({
			organizationId: input.organizationId,
			title: "New installation to approve",
			message: `${installations[0]?.employee.name ?? "A worker"} submitted ${installations.length} installation line(s)`,
			link: `/app/${org?.slug ?? ""}/installations`,
			excludeUserIds: [user.id],
		}).catch((err: unknown) =>
			logger.warn("[Installation Create] notify failed", {
				error: String(err),
			}),
		);

		return { installations };
	});
