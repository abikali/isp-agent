import { db } from "../client";

export async function getOrganizations({
	limit,
	offset,
	query,
	sortBy = "createdAt",
	sortOrder = "desc",
}: {
	limit: number;
	offset: number;
	query?: string;
	sortBy?: "name" | "createdAt" | "membersCount" | "customersCount";
	sortOrder?: "asc" | "desc";
}) {
	const includeConfig = {
		_count: {
			select: {
				members: true,
				customers: true,
				employees: true,
			},
		},
		activeDealer: {
			select: { id: true, name: true },
		},
	} as const;

	function getOrderBy() {
		switch (sortBy) {
			case "name":
				return { name: sortOrder } as const;
			case "membersCount":
				return { members: { _count: sortOrder } } as const;
			case "customersCount":
				return { customers: { _count: sortOrder } } as const;
			default:
				return { createdAt: sortOrder } as const;
		}
	}

	const where = query
		? { name: { contains: query, mode: "insensitive" as const } }
		: {};

	const orgs = await db.organization.findMany({
		where,
		include: includeConfig,
		take: limit,
		skip: offset,
		orderBy: getOrderBy(),
	});

	return orgs.map((org) => ({
		...org,
		membersCount: org._count.members,
		customersCount: org._count.customers,
		employeesCount: org._count.employees,
	}));
}

export async function countAllOrganizations(query?: string) {
	if (query) {
		return db.organization.count({
			where: { name: { contains: query, mode: "insensitive" } },
		});
	}
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
			activeDealer: {
				select: { id: true, name: true },
			},
			_count: {
				select: {
					customers: true,
					employees: true,
				},
			},
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
