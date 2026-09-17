import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { normalizeMarketingPhone } from "../lib/audience";

/**
 * Opt-out list for marketing broadcasts. Phones here are excluded when a
 * broadcast's audience is built and again right before the worker sends.
 */
export const listSuppressions = protectedProcedure
	.route({
		method: "GET",
		path: "/marketing/suppressions",
		tags: ["Marketing"],
		summary: "List phones opted out of marketing broadcasts",
	})
	.input(
		z.object({
			organizationId: z.string(),
			search: z.string().trim().optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(10).max(100).default(50),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"marketing",
			"read",
		);

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
		};
		if (input.search) {
			const digits = input.search.replace(/\D/g, "");
			where["OR"] = [
				...(digits ? [{ phone: { contains: digits } }] : []),
				{ reason: { contains: input.search, mode: "insensitive" } },
			];
		}

		const [total, items] = await Promise.all([
			db.marketingSuppression.count({ where: where as never }),
			db.marketingSuppression.findMany({
				where: where as never,
				orderBy: { createdAt: "desc" },
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
				select: {
					id: true,
					phone: true,
					reason: true,
					source: true,
					createdAt: true,
				},
			}),
		]);

		return { items, total, page: input.page, pageSize: input.pageSize };
	});

export const addSuppressions = protectedProcedure
	.route({
		method: "POST",
		path: "/marketing/suppressions",
		tags: ["Marketing"],
		summary: "Opt phones out of marketing broadcasts",
	})
	.input(
		z.object({
			organizationId: z.string(),
			phones: z.array(z.string()).min(1).max(5000),
			reason: z.string().trim().max(200).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"marketing",
			"send",
		);

		const phones = new Set<string>();
		const invalid: string[] = [];
		for (const raw of input.phones) {
			const phone = normalizeMarketingPhone(raw);
			if (phone) {
				phones.add(phone);
			} else if (raw.trim()) {
				invalid.push(raw.trim());
			}
		}
		if (phones.size === 0) {
			throw new ORPCError("BAD_REQUEST", {
				message: "None of the entries is a valid phone number.",
			});
		}

		const { count } = await db.marketingSuppression.createMany({
			data: [...phones].map((phone) => ({
				organizationId: input.organizationId,
				phone,
				reason: input.reason || null,
				source: "manual",
				createdById: user.id,
			})),
			skipDuplicates: true,
		});

		return {
			added: count,
			alreadyListed: phones.size - count,
			invalid,
		};
	});

export const removeSuppression = protectedProcedure
	.route({
		method: "DELETE",
		path: "/marketing/suppressions/{suppressionId}",
		tags: ["Marketing"],
		summary: "Remove a phone from the marketing opt-out list",
	})
	.input(
		z.object({
			organizationId: z.string(),
			suppressionId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"marketing",
			"send",
		);

		const { count } = await db.marketingSuppression.deleteMany({
			where: {
				id: input.suppressionId,
				organizationId: input.organizationId,
			},
		});
		if (count === 0) {
			throw new ORPCError("NOT_FOUND", {
				message: "Opt-out entry not found",
			});
		}
		return { success: true };
	});
