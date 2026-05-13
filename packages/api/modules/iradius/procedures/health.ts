import { requirePermission } from "@repo/api/lib/permission";
import {
	queryIRadiusLiveStats,
	testIRadiusConnection,
} from "@repo/database/iradius";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getIradiusHealth = protectedProcedure
	.route({
		method: "GET",
		path: "/iradius/health",
		tags: ["iRadius"],
		summary: "Probe iRadius MySQL + return high-level live stats",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"connections",
			"read",
		);

		const startedAt = Date.now();
		const probe = await testIRadiusConnection();
		const latencyMs = Date.now() - startedAt;

		const liveStats = probe.connected
			? await queryIRadiusLiveStats()
			: null;

		return {
			ok: probe.connected,
			latencyMs,
			error: probe.connected ? null : (probe.error ?? null),
			counts: probe.counts ?? null,
			liveStats,
		};
	});
