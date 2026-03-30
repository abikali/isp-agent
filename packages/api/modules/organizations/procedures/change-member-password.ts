import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { hashPassword } from "@repo/utils/password";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const changeMemberPassword = protectedProcedure
	.route({
		method: "POST",
		path: "/organizations/members/change-password",
		tags: ["Organizations"],
		summary: "Change a member's password",
	})
	.input(
		z.object({
			organizationId: z.string(),
			userId: z.string(),
			newPassword: z.string().min(1, "Password is required"),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"member",
			"update",
		);

		// Verify the target user is a member of this org
		const member = await db.member.findUnique({
			where: {
				organizationId_userId: {
					organizationId: input.organizationId,
					userId: input.userId,
				},
			},
		});
		if (!member) {
			throw new ORPCError("NOT_FOUND", {
				message: "Member not found in this organization",
			});
		}

		// Find the credential account
		const account = await db.account.findFirst({
			where: {
				userId: input.userId,
				providerId: "credential",
			},
		});

		if (!account) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"This member does not have a password-based login account",
			});
		}

		const passwordHash = await hashPassword(input.newPassword);

		await db.account.update({
			where: { id: account.id },
			data: {
				password: passwordHash,
				updatedAt: new Date(),
			},
		});

		return { success: true };
	});
