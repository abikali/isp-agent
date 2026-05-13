import { db } from "@repo/database";
import { z } from "zod";
import { verifyOrganizationMembership } from "../../lib/membership";
import { protectedProcedure, publicProcedure } from "../../orpc/procedures";

/**
 * Cross-cutting procedures used by the command palette and other shared UI.
 */

const SearchTypeSchema = z.enum([
	"customer",
	"employee",
	"task",
	"conversation",
	"broadcast",
]);

const SearchResultSchema = z.object({
	type: SearchTypeSchema,
	id: z.string(),
	label: z.string(),
	sub: z.string().nullable(),
	link: z.string(),
});

type SearchResult = z.infer<typeof SearchResultSchema>;

/**
 * Fan-out search for the global command palette.
 *
 * Returns up to `limitPerType` matches per resource type, ranked by recency.
 * Each row is a discriminated record with a stable shape so the palette can
 * render them generically.
 *
 * Performance: each fan-out query has its own `take` cap and is `Promise.all`'d.
 * Postgres `mode: "insensitive"` for case-insensitive contains.
 */
const find = protectedProcedure
	.route({
		method: "GET",
		path: "/shared/search",
		tags: ["Shared"],
		summary:
			"Global fan-out search across customers/employees/tasks/conversations/broadcasts",
	})
	.input(
		z.object({
			organizationId: z.string(),
			organizationSlug: z.string().optional(),
			q: z.string().min(1).max(128),
			limitPerType: z.number().min(1).max(10).default(5),
			types: z.array(SearchTypeSchema).optional(),
		}),
	)
	.handler(async ({ input, context: { user } }) => {
		await verifyOrganizationMembership(user.id, input.organizationId);

		const q = input.q.trim();
		if (q.length === 0) {
			return { results: [] };
		}

		const limit = input.limitPerType;
		const types = new Set(
			input.types ?? [
				"customer",
				"employee",
				"task",
				"conversation",
				"broadcast",
			],
		);

		// URL prefix derived once for link construction.
		// If slug not provided, fall back to organization ID (still works in the app).
		const slug = input.organizationSlug ?? input.organizationId;
		const orgPath = `/app/${slug}`;

		const [customers, employees, tasks, conversations, broadcasts] =
			await Promise.all([
				types.has("customer")
					? db.customer.findMany({
							where: {
								organizationId: input.organizationId,
								// Skip soft-deleted customers in global search —
								// they're back-references only.
								deletedAt: null,
								OR: [
									{
										firstName: {
											contains: q,
											mode: "insensitive",
										},
									},
									{
										lastName: {
											contains: q,
											mode: "insensitive",
										},
									},
									{
										username: {
											contains: q,
											mode: "insensitive",
										},
									},
									{
										email: {
											contains: q,
											mode: "insensitive",
										},
									},
									{
										phone: {
											contains: q,
											mode: "insensitive",
										},
									},
									{
										mobile: {
											contains: q,
											mode: "insensitive",
										},
									},
									{
										accountNumber: {
											contains: q,
											mode: "insensitive",
										},
									},
									{
										macAddress: {
											contains: q,
											mode: "insensitive",
										},
									},
									{
										ipAddress: {
											contains: q,
											mode: "insensitive",
										},
									},
								],
							},
							orderBy: { updatedAt: "desc" },
							take: limit,
							select: {
								id: true,
								firstName: true,
								lastName: true,
								username: true,
								accountNumber: true,
								phone: true,
								mobile: true,
							},
						})
					: Promise.resolve([]),
				types.has("employee")
					? db.employee.findMany({
							where: {
								organizationId: input.organizationId,
								// Match the employees list — skip soft-deleted.
								deletedAt: null,
								OR: [
									{
										name: {
											contains: q,
											mode: "insensitive",
										},
									},
									{
										email: {
											contains: q,
											mode: "insensitive",
										},
									},
									{
										employeeNumber: {
											contains: q,
											mode: "insensitive",
										},
									},
									{
										phone: {
											contains: q,
											mode: "insensitive",
										},
									},
									{
										username: {
											contains: q,
											mode: "insensitive",
										},
									},
								],
							},
							orderBy: { updatedAt: "desc" },
							take: limit,
							select: {
								id: true,
								name: true,
								username: true,
								email: true,
								employeeNumber: true,
							},
						})
					: Promise.resolve([]),
				types.has("task")
					? db.task.findMany({
							where: {
								organizationId: input.organizationId,
								OR: [
									{
										title: {
											contains: q,
											mode: "insensitive",
										},
									},
									{
										description: {
											contains: q,
											mode: "insensitive",
										},
									},
								],
							},
							orderBy: { updatedAt: "desc" },
							take: limit,
							select: {
								id: true,
								title: true,
								status: true,
								priority: true,
							},
						})
					: Promise.resolve([]),
				types.has("conversation")
					? db.aiConversation.findMany({
							where: {
								agent: { organizationId: input.organizationId },
								OR: [
									{
										contactName: {
											contains: q,
											mode: "insensitive",
										},
									},
									{
										externalChatId: {
											contains: q,
											mode: "insensitive",
										},
									},
								],
							},
							orderBy: { updatedAt: "desc" },
							take: limit,
							select: {
								id: true,
								contactName: true,
								externalChatId: true,
								agent: { select: { name: true } },
							},
						})
					: Promise.resolve([]),
				types.has("broadcast")
					? db.marketingBroadcast.findMany({
							where: {
								organizationId: input.organizationId,
								name: { contains: q, mode: "insensitive" },
							},
							orderBy: { createdAt: "desc" },
							take: limit,
							select: {
								id: true,
								name: true,
								status: true,
								templateName: true,
							},
						})
					: Promise.resolve([]),
			]);

		const results: SearchResult[] = [];

		for (const c of customers) {
			const fullName =
				[c.firstName, c.lastName].filter(Boolean).join(" ") ||
				c.username ||
				c.accountNumber ||
				"(unnamed)";
			const sub = [c.username && `@${c.username}`, c.mobile ?? c.phone]
				.filter(Boolean)
				.join(" · ");
			results.push({
				type: "customer",
				id: c.id,
				label: fullName,
				sub: sub || null,
				link: `${orgPath}/customers/${c.id}`,
			});
		}

		for (const e of employees) {
			const sub = [e.employeeNumber && `#${e.employeeNumber}`, e.email]
				.filter(Boolean)
				.join(" · ");
			results.push({
				type: "employee",
				id: e.id,
				label: e.name || e.username || "(unnamed)",
				sub: sub || null,
				link: `${orgPath}/employees/${e.id}`,
			});
		}

		for (const t of tasks) {
			results.push({
				type: "task",
				id: t.id,
				label: t.title,
				sub: [t.status, t.priority].filter(Boolean).join(" · ") || null,
				link: `${orgPath}/tasks/${t.id}`,
			});
		}

		for (const conv of conversations) {
			results.push({
				type: "conversation",
				id: conv.id,
				label:
					conv.contactName ?? conv.externalChatId ?? "Conversation",
				sub:
					[conv.agent?.name, conv.externalChatId]
						.filter(Boolean)
						.join(" · ") || null,
				link: `${orgPath}/conversations/${conv.id}`,
			});
		}

		for (const b of broadcasts) {
			results.push({
				type: "broadcast",
				id: b.id,
				label: b.name,
				sub:
					[b.status, b.templateName].filter(Boolean).join(" · ") ||
					null,
				link: `${orgPath}/marketing/${b.id}`,
			});
		}

		return { results };
	});

export const sharedRouter = publicProcedure.router({
	search: find,
});
