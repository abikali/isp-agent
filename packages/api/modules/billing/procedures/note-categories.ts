import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listNoteCategories = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/note-categories",
		tags: ["Billing"],
		summary: "List note categories for an organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"view",
		);

		const categories = await db.noteCategory.findMany({
			where: { organizationId: input.organizationId },
			orderBy: { sortOrder: "asc" },
		});

		return { categories };
	});

export const createNoteCategory = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/note-categories",
		tags: ["Billing"],
		summary: "Create a note category",
	})
	.input(
		z.object({
			organizationId: z.string(),
			value: z
				.string()
				.min(1)
				.max(50)
				.regex(
					/^[A-Z0-9_]+$/,
					"Must be uppercase letters, numbers, and underscores only",
				),
			label: z.string().min(1).max(100),
			labelAr: z.string().max(100).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const existing = await db.noteCategory.findUnique({
			where: {
				organizationId_value: {
					organizationId: input.organizationId,
					value: input.value,
				},
			},
		});

		if (existing) {
			throw new ORPCError("CONFLICT", {
				message: "A note category with this value already exists",
			});
		}

		// Get the next sort order
		const maxOrder = await db.noteCategory.aggregate({
			where: { organizationId: input.organizationId },
			_max: { sortOrder: true },
		});

		const category = await db.noteCategory.create({
			data: {
				organizationId: input.organizationId,
				value: input.value,
				label: input.label,
				labelAr: input.labelAr ?? null,
				sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
			},
		});

		return { category };
	});

export const updateNoteCategory = protectedProcedure
	.route({
		method: "PUT",
		path: "/billing/note-categories/{id}",
		tags: ["Billing"],
		summary: "Update a note category",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			label: z.string().min(1).max(100).optional(),
			labelAr: z.string().max(100).optional(),
			sortOrder: z.number().int().min(0).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const existing = await db.noteCategory.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
			},
		});

		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Note category not found",
			});
		}

		const updateData: Record<string, unknown> = {};
		if (input.label !== undefined) {
			updateData["label"] = input.label;
		}
		if (input.labelAr !== undefined) {
			updateData["labelAr"] = input.labelAr;
		}
		if (input.sortOrder !== undefined) {
			updateData["sortOrder"] = input.sortOrder;
		}

		const category = await db.noteCategory.update({
			where: { id: input.id },
			data: updateData,
		});

		return { category };
	});

export const deleteNoteCategory = protectedProcedure
	.route({
		method: "DELETE",
		path: "/billing/note-categories/{id}",
		tags: ["Billing"],
		summary: "Delete a note category",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const existing = await db.noteCategory.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
			},
		});

		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Note category not found",
			});
		}

		await db.noteCategory.delete({
			where: { id: input.id },
		});

		return { success: true };
	});
