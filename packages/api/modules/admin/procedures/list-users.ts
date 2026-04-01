import { countAllUsers, getUsers } from "@repo/database";
import { z } from "zod";
import { adminProcedure } from "../../../orpc/procedures";

const sortByEnum = z.enum(["name", "email", "createdAt", "role"]);

export const listUsers = adminProcedure
	.route({
		method: "GET",
		path: "/admin/users",
		tags: ["Administration"],
		summary: "List users",
	})
	.input(
		z.object({
			searchTerm: z.string().default(""),
			itemsPerPage: z.number().min(1).max(100).default(10),
			currentPage: z.number().min(1).default(1),
			sortBy: sortByEnum.optional(),
			sortOrder: z.enum(["asc", "desc"]).default("desc"),
		}),
	)
	.handler(
		async ({
			input: { searchTerm, itemsPerPage, currentPage, sortBy, sortOrder },
		}) => {
			const query = searchTerm || undefined;
			const offset = (currentPage - 1) * itemsPerPage;

			const [users, total] = await Promise.all([
				getUsers({
					limit: itemsPerPage,
					offset,
					...(query ? { query } : {}),
					sortBy: sortBy ?? "createdAt",
					sortOrder,
				}),
				countAllUsers(query),
			]);

			return { users, total };
		},
	);
