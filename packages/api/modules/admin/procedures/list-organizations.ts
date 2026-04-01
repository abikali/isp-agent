import { ORPCError } from "@orpc/client";
import {
	countAllOrganizations,
	getOrganizationById as getOrganizationByIdFn,
	getOrganizations,
} from "@repo/database";
import { z } from "zod";
import { adminProcedure } from "../../../orpc/procedures";

const sortByEnum = z.enum([
	"name",
	"createdAt",
	"membersCount",
	"customersCount",
]);

export const listOrganizations = adminProcedure
	.route({
		method: "GET",
		path: "/admin/organizations",
		tags: ["Administration"],
		summary: "List organizations",
	})
	.input(
		z.object({
			searchTerm: z.string().optional(),
			itemsPerPage: z.number().min(1).max(100).default(10),
			currentPage: z.number().min(1).default(1),
			sortBy: sortByEnum.optional(),
			sortOrder: z.enum(["asc", "desc"]).optional(),
		}),
	)
	.handler(async ({ input }) => {
		const { searchTerm, itemsPerPage, currentPage, sortBy, sortOrder } =
			input;
		const query = searchTerm || undefined;
		const offset = (currentPage - 1) * itemsPerPage;

		const [organizations, total] = await Promise.all([
			getOrganizations({
				limit: itemsPerPage,
				offset,
				...(query ? { query } : {}),
				...(sortBy ? { sortBy } : {}),
				...(sortOrder ? { sortOrder } : {}),
			}),
			countAllOrganizations(query),
		]);

		return { organizations, total };
	});

export const getOrganizationById = adminProcedure
	.route({
		method: "GET",
		path: "/admin/organizations/{id}",
		tags: ["Administration"],
	})
	.input(
		z.object({
			id: z.string(),
		}),
	)
	.handler(async ({ input: { id } }) => {
		const organization = await getOrganizationByIdFn(id);

		if (!organization) {
			throw new ORPCError("NOT_FOUND");
		}

		return organization;
	});
