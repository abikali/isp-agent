import { requirePermission } from "@repo/api/lib/permission";
import { queryIRadius, withIRadiusConnection } from "@repo/database/iradius";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listIRadiusGroups = protectedProcedure
	.route({
		method: "GET",
		path: "/customers/iradius-groups",
		tags: ["Customers"],
		summary: "List UserGroup rows from iRadius for the group picker",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"read",
		);

		const rows = await withIRadiusConnection((conn) =>
			queryIRadius(conn, "SELECT Id, Name FROM UserGroup ORDER BY Name"),
		);

		const groups = rows
			.map((r) => {
				const id = Number(r["Id"]);
				const name =
					typeof r["Name"] === "string" ? r["Name"].trim() : "";
				if (!Number.isFinite(id) || !name) {
					return null;
				}
				return { id, name };
			})
			.filter((g): g is { id: number; name: string } => g !== null);

		return { groups };
	});
