import { createId } from "@paralleldrive/cuid2";
import { db } from "@repo/database";
import { z } from "zod";
import { verifyOrganizationMembership } from "../../lib/membership";
import { protectedProcedure, publicProcedure } from "../../orpc/procedures";

/**
 * Server-persisted saved views for list pages.
 *
 * A saved view captures filters/sort/columns/density for a given resource
 * (customers, tasks, payments, etc.) so users can recall named queries.
 * `pinned` views show up as sidebar shortcuts.
 *
 * Scope: per-user, per-organization, per-resource. Names are unique within
 * that scope.
 */

const RESOURCE_SCHEMA = z
	.string()
	.min(1)
	.max(64)
	.regex(/^[a-z][a-z0-9-]*$/, "resource must be kebab-case");

const list = protectedProcedure
	.route({
		method: "GET",
		path: "/saved-views",
		tags: ["SavedViews"],
		summary: "List saved views for the current user in an organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
			resource: RESOURCE_SCHEMA.optional(),
		}),
	)
	.handler(async ({ input, context: { user } }) => {
		await verifyOrganizationMembership(user.id, input.organizationId);

		const views = await db.savedView.findMany({
			where: {
				userId: user.id,
				organizationId: input.organizationId,
				...(input.resource ? { resource: input.resource } : {}),
			},
			orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
		});

		return { views };
	});

const create = protectedProcedure
	.route({
		method: "POST",
		path: "/saved-views",
		tags: ["SavedViews"],
		summary: "Create a saved view",
	})
	.input(
		z.object({
			organizationId: z.string(),
			resource: RESOURCE_SCHEMA,
			name: z.string().min(1).max(64),
			config: z.unknown(),
			pinned: z.boolean().default(false),
		}),
	)
	.handler(async ({ input, context: { user } }) => {
		await verifyOrganizationMembership(user.id, input.organizationId);

		const view = await db.savedView.create({
			data: {
				id: createId(),
				userId: user.id,
				organizationId: input.organizationId,
				resource: input.resource,
				name: input.name,
				config: input.config as never,
				pinned: input.pinned,
			},
		});

		return { view };
	});

const update = protectedProcedure
	.route({
		method: "PUT",
		path: "/saved-views/{id}",
		tags: ["SavedViews"],
		summary: "Update a saved view",
	})
	.input(
		z.object({
			id: z.string(),
			name: z.string().min(1).max(64).optional(),
			config: z.unknown().optional(),
			pinned: z.boolean().optional(),
		}),
	)
	.handler(async ({ input, context: { user } }) => {
		const updateData: Record<string, unknown> = {};
		if (input.name !== undefined) {
			updateData["name"] = input.name;
		}
		if (input.config !== undefined) {
			updateData["config"] = input.config;
		}
		if (input.pinned !== undefined) {
			updateData["pinned"] = input.pinned;
		}

		const { count } = await db.savedView.updateMany({
			where: { id: input.id, userId: user.id },
			data: updateData,
		});

		if (count === 0) {
			return { success: false };
		}
		return { success: true };
	});

const remove = protectedProcedure
	.route({
		method: "DELETE",
		path: "/saved-views/{id}",
		tags: ["SavedViews"],
		summary: "Delete a saved view",
	})
	.input(z.object({ id: z.string() }))
	.handler(async ({ input, context: { user } }) => {
		await db.savedView.deleteMany({
			where: { id: input.id, userId: user.id },
		});
		return { success: true };
	});

const pinToggle = protectedProcedure
	.route({
		method: "PUT",
		path: "/saved-views/{id}/pin",
		tags: ["SavedViews"],
		summary: "Toggle pinned state of a saved view",
	})
	.input(z.object({ id: z.string(), pinned: z.boolean() }))
	.handler(async ({ input, context: { user } }) => {
		await db.savedView.updateMany({
			where: { id: input.id, userId: user.id },
			data: { pinned: input.pinned },
		});
		return { success: true };
	});

export const savedViewsRouter = publicProcedure.router({
	list,
	create,
	update,
	delete: remove,
	pin: pinToggle,
});
