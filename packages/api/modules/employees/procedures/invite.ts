import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import {
	ISP_ROLE_TEMPLATES,
	type IspRoleTemplate,
} from "@repo/auth/permissions";
import { db } from "@repo/database";
import { hashPassword } from "@repo/utils/password";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

const DEFAULT_PASSWORD = "123456";

/**
 * Invite an Employee to log in by creating an org membership with an ISP role.
 * Uses the employee's username (defaults to iRadius username) as the login credential.
 * The user is created with a default password and auto-verified (no email verification).
 *
 * Flow:
 * 1. Validate employee exists, has a username, not already linked
 * 2. Ensure the ISP role exists in the org's custom roles (create if missing)
 * 3. Find or create User by username (with default password, auto-verified)
 * 4. Create Member with the ISP role
 * 5. Link Employee.userId → User.id
 */
export const inviteEmployee = protectedProcedure
	.route({
		method: "POST",
		path: "/employees/invite",
		tags: ["Employees"],
		summary: "Invite an employee to log in with an ISP role",
	})
	.input(
		z.object({
			organizationId: z.string(),
			employeeId: z.string(),
			role: z.enum(["collector", "field_tech", "dealer", "manager"]),
			username: z.string().min(1, "Username is required"),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"employees",
			"create",
		);

		// 1. Load employee
		const employee = await db.employee.findFirst({
			where: {
				id: input.employeeId,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
		});
		if (!employee) {
			throw new ORPCError("NOT_FOUND", {
				message: "Employee not found",
			});
		}
		if (employee.userId) {
			throw new ORPCError("CONFLICT", {
				message: "Employee already has a login account",
			});
		}

		const loginUsername = input.username.trim().toLowerCase();

		// Check if another employee in this org already uses this username for login
		const otherLinkedEmployee = await db.employee.findFirst({
			where: {
				organizationId: input.organizationId,
				username: {
					equals: loginUsername,
					mode: "insensitive",
				},
				userId: { not: null },
				id: { not: input.employeeId },
			},
		});
		if (otherLinkedEmployee) {
			throw new ORPCError("CONFLICT", {
				message: `Username "${loginUsername}" is already used for login by another employee (${otherLinkedEmployee.name})`,
			});
		}

		// 2. Ensure the ISP role exists in this org's custom roles
		const template = ISP_ROLE_TEMPLATES[input.role as IspRoleTemplate];
		const rolePermissions: Record<string, string[]> = {};
		for (const resource of Object.keys(template.permissions)) {
			const actions =
				template.permissions[
					resource as keyof typeof template.permissions
				];
			if (actions) {
				rolePermissions[resource] = [...actions];
			}
		}

		await db.organizationRole.upsert({
			where: {
				organizationId_role: {
					organizationId: input.organizationId,
					role: input.role,
				},
			},
			update: {},
			create: {
				organizationId: input.organizationId,
				role: input.role,
				permission: JSON.stringify(rolePermissions),
			},
		});

		// 3. Find or create User by username
		let targetUser = await db.user.findFirst({
			where: {
				username: {
					equals: loginUsername,
					mode: "insensitive",
				},
			},
		});

		if (targetUser) {
			// Block if this user is already a member of the org
			const existingMember = await db.member.findUnique({
				where: {
					organizationId_userId: {
						organizationId: input.organizationId,
						userId: targetUser.id,
					},
				},
			});
			if (existingMember) {
				throw new ORPCError("CONFLICT", {
					message: `A user with username "${loginUsername}" is already a member of this organization`,
				});
			}
		} else {
			// Create a new user with default password, auto-verified
			const passwordHash = await hashPassword(DEFAULT_PASSWORD);
			const now = new Date();

			targetUser = await db.user.create({
				data: {
					name: employee.name,
					email: `${loginUsername}@employee.local`,
					username: loginUsername,
					emailVerified: true,
					onboardingComplete: true,
					createdAt: now,
					updatedAt: now,
				},
			});

			// Create credential account with default password
			await db.account.create({
				data: {
					accountId: targetUser.id,
					providerId: "credential",
					userId: targetUser.id,
					password: passwordHash,
					createdAt: now,
					updatedAt: now,
				},
			});
		}

		// 4. Create org membership
		await db.member.create({
			data: {
				organizationId: input.organizationId,
				userId: targetUser.id,
				role: input.role,
				createdAt: new Date(),
			},
		});

		// 5. Link Employee → User
		await db.employee.update({
			where: { id: input.employeeId },
			data: { userId: targetUser.id },
		});

		return {
			userId: targetUser.id,
			role: input.role,
			username: loginUsername,
		};
	});
