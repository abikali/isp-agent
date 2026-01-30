import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@repo/database";
import { z } from "zod";
import {
	adminProcedure,
	protectedProcedure,
	publicProcedure,
} from "../../orpc/procedures";

// Create a new feature flag (admin only)
const createFeatureFlag = adminProcedure
	.route({
		method: "POST",
		path: "/feature-flags",
		tags: ["Feature Flags"],
		summary: "Create a new feature flag",
	})
	.input(
		z.object({
			key: z
				.string()
				.min(1)
				.max(100)
				.regex(
					/^[a-z0-9_]+$/,
					"Key must be lowercase alphanumeric with underscores",
				),
			name: z.string().min(1).max(255),
			description: z.string().max(1000).optional(),
			enabled: z.boolean().default(false),
			percentage: z.number().min(0).max(100).default(100),
			targetUsers: z.array(z.string()).default([]),
			targetOrgs: z.array(z.string()).default([]),
		}),
	)
	.handler(async ({ input }) => {
		// Check if flag already exists
		const existing = await db.featureFlag.findUnique({
			where: { key: input.key },
		});

		if (existing) {
			throw new ORPCError("CONFLICT", {
				message: "Feature flag with this key already exists",
			});
		}

		const data: {
			id: string;
			key: string;
			name: string;
			enabled: boolean;
			percentage: number;
			targetUsers: string[];
			targetOrgs: string[];
			updatedAt: Date;
			description?: string;
		} = {
			id: createId(),
			key: input.key,
			name: input.name,
			enabled: input.enabled,
			percentage: input.percentage,
			targetUsers: input.targetUsers,
			targetOrgs: input.targetOrgs,
			updatedAt: new Date(),
		};
		if (input.description !== undefined) {
			data.description = input.description;
		}
		const flag = await db.featureFlag.create({
			data,
		});

		return flag;
	});

// List all feature flags (admin only)
const listFeatureFlags = adminProcedure
	.route({
		method: "GET",
		path: "/feature-flags",
		tags: ["Feature Flags"],
		summary: "List all feature flags",
	})
	.handler(async () => {
		const flags = await db.featureFlag.findMany({
			orderBy: { createdAt: "desc" },
		});

		return flags;
	});

// Get a specific feature flag (admin only)
const getFeatureFlag = adminProcedure
	.route({
		method: "GET",
		path: "/feature-flags/{key}",
		tags: ["Feature Flags"],
		summary: "Get a specific feature flag",
	})
	.input(z.object({ key: z.string() }))
	.handler(async ({ input }) => {
		const flag = await db.featureFlag.findUnique({
			where: { key: input.key },
		});

		if (!flag) {
			throw new ORPCError("NOT_FOUND", {
				message: "Feature flag not found",
			});
		}

		return flag;
	});

// Update a feature flag (admin only)
const updateFeatureFlag = adminProcedure
	.route({
		method: "PUT",
		path: "/feature-flags/{key}",
		tags: ["Feature Flags"],
		summary: "Update a feature flag",
	})
	.input(
		z.object({
			key: z.string(),
			name: z.string().min(1).max(255).optional(),
			description: z.string().max(1000).optional().nullable(),
			enabled: z.boolean().optional(),
			percentage: z.number().min(0).max(100).optional(),
			targetUsers: z.array(z.string()).optional(),
			targetOrgs: z.array(z.string()).optional(),
		}),
	)
	.handler(async ({ input }) => {
		const {
			key,
			name,
			description,
			enabled,
			percentage,
			targetUsers,
			targetOrgs,
		} = input;

		const flag = await db.featureFlag.findUnique({
			where: { key },
		});

		if (!flag) {
			throw new ORPCError("NOT_FOUND", {
				message: "Feature flag not found",
			});
		}

		// Build update data conditionally for exactOptionalPropertyTypes
		type FlagUpdateData = {
			name?: string;
			description?: string | null;
			enabled?: boolean;
			percentage?: number;
			targetUsers?: string[];
			targetOrgs?: string[];
		};
		const data: FlagUpdateData = {};
		if (name !== undefined) {
			data.name = name;
		}
		if (description !== undefined) {
			data.description = description;
		}
		if (enabled !== undefined) {
			data.enabled = enabled;
		}
		if (percentage !== undefined) {
			data.percentage = percentage;
		}
		if (targetUsers !== undefined) {
			data.targetUsers = targetUsers;
		}
		if (targetOrgs !== undefined) {
			data.targetOrgs = targetOrgs;
		}

		const updated = await db.featureFlag.update({
			where: { key },
			data,
		});

		return updated;
	});

// Delete a feature flag (admin only)
const deleteFeatureFlag = adminProcedure
	.route({
		method: "DELETE",
		path: "/feature-flags/{key}",
		tags: ["Feature Flags"],
		summary: "Delete a feature flag",
	})
	.input(z.object({ key: z.string() }))
	.handler(async ({ input }) => {
		const flag = await db.featureFlag.findUnique({
			where: { key: input.key },
		});

		if (!flag) {
			throw new ORPCError("NOT_FOUND", {
				message: "Feature flag not found",
			});
		}

		await db.featureFlag.delete({
			where: { key: input.key },
		});

		return { success: true };
	});

// Check if a feature is enabled for the current user (protected)
const checkFeature = protectedProcedure
	.route({
		method: "GET",
		path: "/feature-flags/check/{key}",
		tags: ["Feature Flags"],
		summary: "Check if a feature is enabled for the current user",
	})
	.input(
		z.object({
			key: z.string(),
			organizationId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user } }) => {
		const { isFeatureEnabled } = await import("@repo/feature-flags");

		const options: { userId: string; organizationId?: string } = {
			userId: user.id,
		};
		if (input.organizationId !== undefined) {
			options.organizationId = input.organizationId;
		}
		const enabled = await isFeatureEnabled(input.key, options);

		return { enabled };
	});

// Get all enabled features for the current user (protected)
const getEnabledFeatures = protectedProcedure
	.route({
		method: "GET",
		path: "/feature-flags/enabled",
		tags: ["Feature Flags"],
		summary: "Get all enabled features for the current user",
	})
	.input(
		z.object({
			organizationId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user } }) => {
		const { getEnabledFeatures: getEnabled } = await import(
			"@repo/feature-flags"
		);

		const options: { userId: string; organizationId?: string } = {
			userId: user.id,
		};
		if (input.organizationId !== undefined) {
			options.organizationId = input.organizationId;
		}
		const features = await getEnabled(options);

		return { features };
	});

export const featureFlagsRouter = publicProcedure.router({
	create: createFeatureFlag,
	list: listFeatureFlags,
	get: getFeatureFlag,
	update: updateFeatureFlag,
	delete: deleteFeatureFlag,
	check: checkFeature,
	enabled: getEnabledFeatures,
});
