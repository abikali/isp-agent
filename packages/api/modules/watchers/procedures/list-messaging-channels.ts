import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listMessagingChannels = protectedProcedure
	.route({
		method: "GET",
		path: "/watchers/messaging-channels",
		tags: ["Watchers"],
		summary: "List available messaging channels for watcher notifications",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input: { organizationId } }) => {
		const member = await verifyOrganizationMembership(
			organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		const channels = await db.aiAgentChannel.findMany({
			where: {
				enabled: true,
				agent: {
					organizationId,
				},
			},
			select: {
				id: true,
				provider: true,
				name: true,
				agent: {
					select: {
						name: true,
					},
				},
			},
			orderBy: { createdAt: "asc" },
		});

		return {
			channels: channels.map((ch) => ({
				id: ch.id,
				provider: ch.provider,
				name: ch.name,
				agentName: ch.agent.name,
			})),
		};
	});
