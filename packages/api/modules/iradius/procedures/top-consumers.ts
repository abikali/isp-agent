import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getTopConsumers = protectedProcedure
	.route({
		method: "GET",
		path: "/iradius/top-consumers",
		tags: ["iRadius"],
		summary: "Top N customers by total bandwidth (download + upload bytes)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			limit: z.number().int().min(1).max(50).default(10),
			window: z.enum(["daily", "total"]).default("daily"),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"view",
		);

		const customers = await db.customer.findMany({
			where: {
				organizationId: input.organizationId,
				deletedAt: null,
				...getDealerScopeFilter(activeDealerId),
			},
			select: {
				id: true,
				username: true,
				firstName: true,
				lastName: true,
				downloadBytes: true,
				uploadBytes: true,
				dailyDownloadBytes: true,
				dailyUploadBytes: true,
				online: true,
			},
		});

		const enriched = customers
			.filter((c): c is typeof c & { username: string } => !!c.username)
			.map((c) => {
				const dl =
					input.window === "daily"
						? Number(c.dailyDownloadBytes ?? BigInt(0))
						: Number(c.downloadBytes ?? BigInt(0));
				const ul =
					input.window === "daily"
						? Number(c.dailyUploadBytes ?? BigInt(0))
						: Number(c.uploadBytes ?? BigInt(0));
				const fullName =
					[c.firstName, c.lastName].filter(Boolean).join(" ") ||
					c.username;
				return {
					id: c.id,
					username: c.username,
					fullName,
					online: c.online,
					downloadBytes: dl,
					uploadBytes: ul,
					totalBytes: dl + ul,
				};
			})
			.filter((c) => c.totalBytes > 0)
			.sort((a, b) => b.totalBytes - a.totalBytes)
			.slice(0, input.limit);

		return { consumers: enriched };
	});
