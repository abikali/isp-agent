import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listOrganizationMembers = protectedProcedure
	.route({
		method: "GET",
		path: "/organizations/members",
		tags: ["Organizations"],
		summary: "List organization members with username info",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const member = await verifyOrganizationMembership(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		const members = await db.member.findMany({
			where: { organizationId: input.organizationId },
			include: {
				user: {
					select: {
						id: true,
						name: true,
						email: true,
						image: true,
						username: true,
					},
				},
			},
			orderBy: { createdAt: "asc" },
		});

		return {
			members: members.map((m) => ({
				id: m.id,
				userId: m.userId,
				role: m.role,
				createdAt: m.createdAt,
				user: {
					id: m.user.id,
					name: m.user.name,
					email: m.user.email,
					image: m.user.image,
					username: m.user.username,
				},
			})),
		};
	});
