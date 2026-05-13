import { createId } from "@paralleldrive/cuid2";
import { db } from "@repo/database";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../../orpc/procedures";

/**
 * Per-user UI preferences for the dashboard.
 *
 * Stored as `(userId, key, value)` rows where value is arbitrary JSON.
 * Examples: "density" → "compact" | "comfortable", "sidebar_open" → true,
 * "pinned_shortcuts" → string[], "recent_items" → string[].
 *
 * Generic JSON storage so adding a new pref needs no migration.
 */

const KEY_SCHEMA = z
	.string()
	.min(1)
	.max(64)
	.regex(/^[a-z][a-z0-9_]*$/, "key must be snake_case");

const getOne = protectedProcedure
	.route({
		method: "GET",
		path: "/user-prefs/{key}",
		tags: ["UserPrefs"],
		summary: "Get a single user preference",
	})
	.input(z.object({ key: KEY_SCHEMA }))
	.handler(async ({ input, context: { user } }) => {
		const pref = await db.userPref.findUnique({
			where: { userId_key: { userId: user.id, key: input.key } },
			select: { value: true },
		});
		return { value: pref?.value ?? null };
	});

const getAll = protectedProcedure
	.route({
		method: "GET",
		path: "/user-prefs",
		tags: ["UserPrefs"],
		summary: "Get all preferences for the current user",
	})
	.handler(async ({ context: { user } }) => {
		const prefs = await db.userPref.findMany({
			where: { userId: user.id },
			select: { key: true, value: true },
		});
		const result: Record<string, unknown> = {};
		for (const pref of prefs) {
			result[pref.key] = pref.value;
		}
		return { prefs: result };
	});

const set = protectedProcedure
	.route({
		method: "PUT",
		path: "/user-prefs/{key}",
		tags: ["UserPrefs"],
		summary: "Set a single user preference",
	})
	.input(
		z.object({
			key: KEY_SCHEMA,
			value: z.unknown(),
		}),
	)
	.handler(async ({ input, context: { user } }) => {
		await db.userPref.upsert({
			where: { userId_key: { userId: user.id, key: input.key } },
			create: {
				id: createId(),
				userId: user.id,
				key: input.key,
				value: input.value as never,
			},
			update: {
				value: input.value as never,
			},
		});
		return { success: true };
	});

const remove = protectedProcedure
	.route({
		method: "DELETE",
		path: "/user-prefs/{key}",
		tags: ["UserPrefs"],
		summary: "Delete a user preference",
	})
	.input(z.object({ key: KEY_SCHEMA }))
	.handler(async ({ input, context: { user } }) => {
		await db.userPref.deleteMany({
			where: { userId: user.id, key: input.key },
		});
		return { success: true };
	});

export const userPrefsRouter = publicProcedure.router({
	get: getOne,
	getAll,
	set,
	delete: remove,
});
