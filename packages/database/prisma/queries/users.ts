import { createId } from "@paralleldrive/cuid2";
import { db } from "../client";
import type { UserModel } from "../generated/models";

type User = UserModel;

export async function getUsers({
	limit,
	offset,
	query,
}: {
	limit: number;
	offset: number;
	query?: string;
}) {
	const findManyArgs: Parameters<typeof db.user.findMany>[0] = {
		take: limit,
		skip: offset,
	};

	if (query) {
		findManyArgs.where = {
			name: { contains: query },
		};
	}

	return await db.user.findMany(findManyArgs);
}

export async function countAllUsers() {
	return await db.user.count();
}

export async function getUserById(id: string) {
	return await db.user.findUnique({
		where: {
			id,
		},
	});
}

export async function getUserByEmail(email: string) {
	return await db.user.findUnique({
		where: {
			email,
		},
	});
}

export async function createUser({
	email,
	name,
	role,
	emailVerified,
	onboardingComplete,
}: {
	email: string;
	name: string;
	role: "admin" | "user";
	emailVerified: boolean;
	onboardingComplete: boolean;
}) {
	return await db.user.create({
		data: {
			id: createId(),
			email,
			name,
			role,
			emailVerified,
			onboardingComplete,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});
}

export async function getAccountById(id: string) {
	return await db.account.findUnique({
		where: {
			id,
		},
	});
}

export async function createUserAccount({
	userId,
	providerId,
	accountId,
	hashedPassword,
}: {
	userId: string;
	providerId: string;
	accountId: string;
	hashedPassword?: string;
}) {
	return await db.account.create({
		data: {
			id: createId(),
			userId,
			accountId,
			providerId,
			password: hashedPassword ?? null,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});
}

export async function updateUser(userUpdate: Partial<User> & { id: string }) {
	const { id, ...updates } = userUpdate;

	// Filter out undefined values to avoid issues with exactOptionalPropertyTypes
	const data: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(updates)) {
		if (value !== undefined) {
			data[key] = value;
		}
	}

	return await db.user.update({
		where: { id },
		data,
	});
}
