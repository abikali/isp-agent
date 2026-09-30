import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db, MAX_PHONES } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

const phoneSchema = z.object({
	number: z.string().trim().min(3).max(50),
	primary: z.boolean(),
});

const supplierSelect = {
	id: true,
	name: true,
	phones: true,
	notes: true,
	archivedAt: true,
	_count: { select: { items: true, logs: true } },
	// Last delivery, for the Suppliers page.
	logs: {
		orderBy: { createdAt: "desc" },
		take: 1,
		select: { createdAt: true },
	},
} as const;

export const listSuppliers = protectedProcedure
	.route({
		method: "GET",
		path: "/stock/suppliers",
		tags: ["Stock"],
		summary: "List suppliers",
	})
	.input(
		z.object({
			organizationId: z.string(),
			// Archived suppliers are hidden from pickers; the Suppliers page
			// can list them to restore one.
			includeArchived: z.boolean().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"inventory",
			"read",
		);
		const suppliers = await db.supplier.findMany({
			where: {
				organizationId: input.organizationId,
				...(input.includeArchived ? {} : { archivedAt: null }),
			},
			select: supplierSelect,
			orderBy: { name: "asc" },
		});
		return { suppliers };
	});

export const createSupplier = protectedProcedure
	.route({
		method: "POST",
		path: "/stock/suppliers",
		tags: ["Stock"],
		summary: "Create a supplier",
	})
	.input(
		z.object({
			organizationId: z.string(),
			name: z.string().trim().min(1).max(255),
			phones: z.array(phoneSchema).max(MAX_PHONES).default([]),
			notes: z.string().max(2000).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"inventory",
			"create",
		);
		const duplicate = await db.supplier.findFirst({
			where: { organizationId: input.organizationId, name: input.name },
			select: { id: true, archivedAt: true },
		});
		if (duplicate && !duplicate.archivedAt) {
			throw new ORPCError("CONFLICT", {
				message: "A supplier with this name already exists",
			});
		}
		// The name is unique per org: re-creating an archived supplier
		// restores it (keeping its delivery history) instead of conflicting.
		if (duplicate) {
			const supplier = await db.supplier.update({
				where: { id: duplicate.id },
				data: {
					archivedAt: null,
					phones: input.phones,
					notes: input.notes ?? null,
				},
				select: supplierSelect,
			});
			return { supplier };
		}
		const supplier = await db.supplier.create({
			data: {
				organizationId: input.organizationId,
				name: input.name,
				phones: input.phones,
				notes: input.notes ?? null,
			},
			select: supplierSelect,
		});
		return { supplier };
	});

export const updateSupplier = protectedProcedure
	.route({
		method: "PATCH",
		path: "/stock/suppliers/{id}",
		tags: ["Stock"],
		summary: "Update a supplier",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			name: z.string().trim().min(1).max(255).optional(),
			phones: z.array(phoneSchema).max(MAX_PHONES).optional(),
			notes: z.string().max(2000).nullable().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"inventory",
			"update",
		);
		const existing = await db.supplier.findFirst({
			where: { id: input.id, organizationId: input.organizationId },
			select: { id: true },
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Supplier not found" });
		}
		const data: Record<string, unknown> = {};
		if (input.name !== undefined) {
			data["name"] = input.name;
		}
		if (input.phones !== undefined) {
			data["phones"] = input.phones;
		}
		if (input.notes !== undefined) {
			data["notes"] = input.notes ?? null;
		}
		const supplier = await db.supplier.update({
			where: { id: input.id },
			data,
			select: supplierSelect,
		});
		return { supplier };
	});

/**
 * Archive (or restore) a supplier. Archived suppliers leave the pickers but
 * keep their links and delivery history — a hard delete would strip the
 * supplier name from past stock logs.
 */
export const archiveSupplier = protectedProcedure
	.route({
		method: "POST",
		path: "/stock/suppliers/{id}/archive",
		tags: ["Stock"],
		summary: "Archive or restore a supplier",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			archived: z.boolean().default(true),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"inventory",
			"delete",
		);
		const existing = await db.supplier.findFirst({
			where: { id: input.id, organizationId: input.organizationId },
			select: { id: true },
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Supplier not found" });
		}
		const supplier = await db.supplier.update({
			where: { id: input.id },
			data: { archivedAt: input.archived ? new Date() : null },
			select: supplierSelect,
		});
		return { supplier };
	});

/** Replace the set of suppliers an item is bought from. */
export const setStockItemSuppliers = protectedProcedure
	.route({
		method: "PUT",
		path: "/stock/items/{id}/suppliers",
		tags: ["Stock"],
		summary: "Set the suppliers of a stock item",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			supplierIds: z.array(z.string()).max(20),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"inventory",
			"update",
		);
		const item = await db.stockItem.findFirst({
			where: { id: input.id, organizationId: input.organizationId },
			select: { id: true },
		});
		if (!item) {
			throw new ORPCError("NOT_FOUND", {
				message: "Stock item not found",
			});
		}
		const valid = await db.supplier.count({
			where: {
				id: { in: input.supplierIds },
				organizationId: input.organizationId,
			},
		});
		if (valid !== new Set(input.supplierIds).size) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"One of the suppliers does not belong to this organization",
			});
		}
		await db.$transaction([
			db.stockItemSupplier.deleteMany({
				where: { stockItemId: item.id },
			}),
			db.stockItemSupplier.createMany({
				data: [...new Set(input.supplierIds)].map((supplierId) => ({
					stockItemId: item.id,
					supplierId,
				})),
			}),
		]);
		return { success: true };
	});
