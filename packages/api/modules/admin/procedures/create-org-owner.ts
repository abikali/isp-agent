import { ORPCError } from "@orpc/server";
import {
	emailSchema,
	nameSchema,
	passwordSchema,
} from "@repo/api/lib/validation";
import { db } from "@repo/database";
import { hashPassword } from "@repo/utils/password";
import z from "zod";
import { adminProcedure } from "../../../orpc/procedures";

/**
 * Provision an owner login on an organization in one shot.
 *
 * Used from the admin org panel to hand a fresh org over to its real
 * owner without round-tripping through the email-invite flow. Mirrors the
 * dotnet2 seeder's user/member shape: scrypt-hashed credential account,
 * email pre-verified, onboarding skipped, owner membership.
 *
 * If a user with the email already exists, the procedure reuses it
 * (membership is upserted to `owner`). It does NOT overwrite the existing
 * password — the caller must reset it through the normal recovery flow.
 */
export const createOrganizationOwner = adminProcedure
	.route({
		method: "POST",
		path: "/admin/organizations/{organizationId}/owners",
		tags: ["Administration"],
		summary: "Provision an owner login for an organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
			name: nameSchema,
			email: emailSchema,
			password: passwordSchema,
		}),
	)
	.handler(async ({ input }) => {
		const org = await db.organization.findUnique({
			where: { id: input.organizationId },
			select: { id: true },
		});
		if (!org) {
			throw new ORPCError("NOT_FOUND", {
				message: "Organization not found",
			});
		}

		const existingUser = await db.user.findFirst({
			where: { email: input.email },
			select: { id: true },
		});

		let userId: string;
		let passwordReused = false;

		if (existingUser) {
			userId = existingUser.id;
			passwordReused = true;
		} else {
			const passwordHash = await hashPassword(input.password);
			const now = new Date();
			const created = await db.user.create({
				data: {
					name: input.name,
					email: input.email,
					emailVerified: true,
					onboardingComplete: true,
					createdAt: now,
					updatedAt: now,
				},
				select: { id: true },
			});
			await db.account.create({
				data: {
					accountId: created.id,
					providerId: "credential",
					userId: created.id,
					password: passwordHash,
					createdAt: now,
					updatedAt: now,
				},
			});
			userId = created.id;
		}

		await db.member.upsert({
			where: {
				organizationId_userId: {
					organizationId: org.id,
					userId,
				},
			},
			update: { role: "owner" },
			create: {
				organizationId: org.id,
				userId,
				role: "owner",
				createdAt: new Date(),
			},
		});

		return {
			organizationId: org.id,
			userId,
			email: input.email,
			passwordReused,
		};
	});
