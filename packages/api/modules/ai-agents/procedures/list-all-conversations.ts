import { requirePermission } from "@repo/api/lib/permission";
import { db, parsePhones } from "@repo/database";
import { parsePhone, phoneSearchVariants, toNationalDigits } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	customerSearchWhere,
	looksLikePhone,
	phoneSearchDigits,
} from "../../customers/lib/customer-search";

/** Customers a search may expand into their numbers' conversations. */
const SEARCH_CUSTOMER_LIMIT = 100;

export const listAllConversations = protectedProcedure
	.route({
		method: "GET",
		path: "/ai-agents/conversations/all",
		tags: ["AI Agents"],
		summary: "List conversations across all agents for an organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
			agentId: z.string().optional(),
			search: z.string().optional(),
			channelType: z.enum(["web", "whatsapp", "telegram"]).optional(),
			status: z.enum(["active", "archived", "cleared"]).optional(),
			pinned: z.boolean().optional(),
			/** Only conversations with a nudge queued. */
			followUpQueued: z.boolean().optional(),
			/** Only conversations linked to this customer. */
			customerId: z.string().optional(),
			sortBy: z
				.enum([
					"lastMessageAt",
					"messageCount",
					"createdAt",
					"followUpDueAt",
				])
				.default("lastMessageAt"),
			sortOrder: z.enum(["asc", "desc"]).default("desc"),
			cursor: z.string().optional(),
			limit: z.number().int().min(1).max(100).default(50),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"read",
		);

		const where: Record<string, unknown> = {
			agent: { organizationId: input.organizationId },
		};

		if (input.agentId) {
			where["agentId"] = input.agentId;
		}

		const search = input.search?.trim();
		if (search) {
			const contains = { contains: search, mode: "insensitive" } as const;
			const or: object[] = [
				{ contactName: contains },
				{ externalChatId: contains },
			];
			// contactId is the digits-only number with country code, so a
			// typed "+961 81 394 966" / "081394966" matches on its digits.
			if (looksLikePhone(search)) {
				or.push({ contactId: { contains: phoneSearchDigits(search) } });
			}
			// The WhatsApp name is rarely the customer's: also find chats from
			// any number of a customer the query matches (name, account, or
			// one of their other phones).
			if (search.length >= 3) {
				const customers = await db.customer.findMany({
					where: {
						organizationId: input.organizationId,
						AND: [
							await customerSearchWhere(
								input.organizationId,
								search,
							),
						],
					},
					orderBy: { updatedAt: "desc" },
					take: SEARCH_CUSTOMER_LIMIT,
					select: { mobile: true, phone: true, phones: true },
				});
				const contactIds = new Set<string>();
				for (const c of customers) {
					for (const n of customerNumbers(c)) {
						const digits = parsePhone(n)?.digits;
						if (digits) {
							contactIds.add(digits);
						}
					}
				}
				if (contactIds.size > 0) {
					or.push({ contactId: { in: [...contactIds] } });
				}
			}
			where["OR"] = or;
		}

		if (input.channelType === "web") {
			where["channelId"] = null;
		} else if (input.channelType) {
			where["channel"] = { provider: input.channelType };
		}

		if (input.status) {
			where["status"] = input.status;
		}

		if (input.pinned !== undefined) {
			where["pinned"] = input.pinned;
		}

		if (input.followUpQueued) {
			where["followUpDueAt"] = { not: null };
		}

		if (input.customerId) {
			where["verifiedCustomerId"] = input.customerId;
		}

		const conversations = await db.aiConversation.findMany({
			where,
			take: input.limit + 1,
			...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
			select: {
				id: true,
				externalChatId: true,
				contactName: true,
				contactId: true,
				status: true,
				pinned: true,
				messageCount: true,
				lastMessageAt: true,
				humanTakeoverAt: true,
				followUpDueAt: true,
				followUpAttempts: true,
				followUpMuted: true,
				createdAt: true,
				agent: {
					select: {
						id: true,
						name: true,
					},
				},
				channel: {
					select: {
						id: true,
						provider: true,
						name: true,
					},
				},
				messages: {
					select: {
						content: true,
						role: true,
						createdAt: true,
					},
					orderBy: { createdAt: "desc" },
					take: 1,
				},
			},
			orderBy:
				input.sortBy === "followUpDueAt"
					? {
							followUpDueAt: {
								sort: input.sortOrder,
								nulls: "last",
							},
						}
					: { [input.sortBy]: input.sortOrder },
		});

		const hasMore = conversations.length > input.limit;
		const items = hasMore
			? conversations.slice(0, input.limit)
			: conversations;
		const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

		// Batch-resolve customers from conversation phone numbers. contactId
		// is digits-only; customer numbers are stored in several historical
		// shapes and a chat may come from a secondary number, so match every
		// variant against `mobile` and the `phones` array, then pair them up
		// on national digits.
		const nationalByConversation = new Map<string, string>();
		const variants = new Set<string>();
		for (const c of items) {
			if (c.contactId) {
				nationalByConversation.set(c.id, toNationalDigits(c.contactId));
				for (const v of phoneSearchVariants(c.contactId)) {
					variants.add(v);
				}
			}
		}
		const customers = variants.size
			? await db.customer.findMany({
					where: {
						organizationId: input.organizationId,
						OR: [
							{ mobile: { in: [...variants] } },
							...[...variants].map((v) => ({
								phones: { array_contains: [{ number: v }] },
							})),
						],
					},
					select: {
						id: true,
						username: true,
						accountNumber: true,
						mobile: true,
						phone: true,
						phones: true,
					},
				})
			: [];
		const customersByNational = new Map<
			string,
			Array<(typeof customers)[number]>
		>();
		for (const c of customers) {
			const nationals = new Set(customerNumbers(c).map(toNationalDigits));
			for (const national of nationals) {
				const existing = customersByNational.get(national) ?? [];
				existing.push(c);
				customersByNational.set(national, existing);
			}
		}

		return {
			conversations: items.map((c) => {
				const national = nationalByConversation.get(c.id);
				const matched = national
					? (customersByNational.get(national) ?? [])
					: [];
				return {
					...c,
					lastMessage: c.messages[0] ?? null,
					messages: undefined,
					customers: matched.map((m) => ({
						id: m.id,
						username: m.username,
						accountNumber: m.accountNumber,
					})),
				};
			}),
			nextCursor,
		};
	});

/** Every number on file for a customer: primary cache, legacy phone, phones[]. */
function customerNumbers(customer: {
	mobile: string | null;
	phone: string | null;
	phones: unknown;
}): string[] {
	return [
		customer.mobile,
		customer.phone,
		...parsePhones(customer.phones).map((p) => p.number),
	].filter((n): n is string => Boolean(n));
}
