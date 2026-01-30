import { db } from "../client";

export async function getOrganizations({
	limit,
	offset,
	query,
}: {
	limit: number;
	offset: number;
	query?: string;
}) {
	const includeConfig = {
		_count: {
			select: {
				members: true,
			},
		},
	} as const;

	const orgs = query
		? await db.organization.findMany({
				where: { name: { contains: query, mode: "insensitive" } },
				include: includeConfig,
				take: limit,
				skip: offset,
			})
		: await db.organization.findMany({
				include: includeConfig,
				take: limit,
				skip: offset,
			});

	return orgs.map((org) => ({
		...org,
		membersCount: org._count.members,
	}));
}

export async function countAllOrganizations() {
	return db.organization.count();
}

export async function getOrganizationById(id: string) {
	return db.organization.findUnique({
		where: { id },
		include: {
			members: {
				include: {
					user: {
						select: {
							id: true,
							name: true,
							email: true,
							image: true,
						},
					},
				},
			},
			invitations: true,
		},
	});
}

export async function getInvitationById(id: string) {
	return db.invitation.findUnique({
		where: { id },
		include: {
			organization: true,
		},
	});
}

export async function getOrganizationBySlug(slug: string) {
	return db.organization.findUnique({
		where: { slug },
	});
}

export async function getOrganizationMembership(
	organizationId: string,
	userId: string,
) {
	return db.member.findUnique({
		where: {
			organizationId_userId: {
				organizationId,
				userId,
			},
		},
		include: {
			organization: true,
		},
	});
}

export async function getOrganizationWithPurchasesAndMembersCount(
	organizationId: string,
) {
	const organization = await db.organization.findUnique({
		where: {
			id: organizationId,
		},
		include: {
			purchases: true,
			_count: {
				select: {
					members: true,
				},
			},
		},
	});

	return organization
		? {
				...organization,
				membersCount: organization._count.members,
			}
		: null;
}

export async function getPendingInvitationByEmail(email: string) {
	return db.invitation.findFirst({
		where: {
			email,
			status: "pending",
		},
	});
}

export async function updateOrganization(
	organization: { id: string } & Parameters<
		typeof db.organization.update
	>[0]["data"],
) {
	const { id, ...data } = organization;
	return db.organization.update({
		where: { id },
		data,
	});
}
