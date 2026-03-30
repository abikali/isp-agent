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
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Invite an Employee to log in by creating an org membership with an ISP role.
 * The employee must have an email address and not already be linked to a User.
 *
 * Flow:
 * 1. Validate employee exists, has email, not already linked
 * 2. Ensure the ISP role exists in the org's custom roles (create if missing)
 * 3. Find or create User by email
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
		if (!employee.email) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"Employee must have an email address before being invited to log in",
			});
		}
		if (employee.userId) {
			throw new ORPCError("CONFLICT", {
				message: "Employee already has a login account",
			});
		}

		const normalizedEmail = employee.email.trim().toLowerCase();

		// Check if another employee in this org already uses this email for login
		const otherLinkedEmployee = await db.employee.findFirst({
			where: {
				organizationId: input.organizationId,
				email: {
					equals: normalizedEmail,
					mode: "insensitive",
				},
				userId: { not: null },
				id: { not: input.employeeId },
			},
		});
		if (otherLinkedEmployee) {
			throw new ORPCError("CONFLICT", {
				message: `Email "${normalizedEmail}" is already used for login by another employee (${otherLinkedEmployee.name})`,
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

		// 3. Find or create User by email
		let targetUser = await db.user.findFirst({
			where: {
				email: {
					equals: normalizedEmail,
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
					message: `A user with email "${normalizedEmail}" is already a member of this organization`,
				});
			}
		} else {
			// Create a new user account (they'll set password via magic link / reset)
			targetUser = await db.user.create({
				data: {
					name: employee.name,
					email: normalizedEmail,
					emailVerified: false,
					createdAt: new Date(),
					updatedAt: new Date(),
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
			email: normalizedEmail,
		};
	});
