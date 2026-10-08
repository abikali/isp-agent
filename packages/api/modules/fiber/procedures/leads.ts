import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { LEAD_CUSTOMER_SELECT, leadFieldsFromCustomer } from "@repo/jobs";
import { normalizeArea, normalizePhone } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	looksLikePhone,
	phoneSearchDigits,
} from "../../customers/lib/customer-search";
import {
	FIBER_BOX_STATUSES,
	FIBER_LOST_REASONS,
	FIBER_SOURCES,
	FIBER_STAGE_LABELS,
	FIBER_STAGES,
	type FiberStage,
	OPEN_FIBER_STAGES,
} from "../lib/constants";
import { leadScopeWhere } from "../lib/queries";

const LEAD_SELECT = {
	id: true,
	name: true,
	phone: true,
	area: true,
	stage: true,
	source: true,
	lostReason: true,
	boxStatus: true,
	boxCode: true,
	ogeroApproached: true,
	ogeroRequestRef: true,
	nextActionAt: true,
	lastContactAt: true,
	conversationId: true,
	taskId: true,
	notes: true,
	wonAt: true,
	lostAt: true,
	createdAt: true,
	updatedAt: true,
	assignee: { select: { id: true, name: true } },
	customer: {
		select: {
			id: true,
			firstName: true,
			lastName: true,
			username: true,
			mobile: true,
			phone: true,
			phones: true,
			landline: true,
			hasLandline: true,
			status: true,
			groupName: true,
			monthlyRate: true,
			plan: { select: { name: true } },
		},
	},
} as const;

async function loadLead(
	organizationId: string,
	activeDealerId: string | null,
	id: string,
) {
	const lead = await db.fiberLead.findFirst({
		where: {
			id,
			...leadScopeWhere(organizationId, activeDealerId),
		} as never,
		select: {
			...LEAD_SELECT,
			assigneeId: true,
			customerId: true,
			activities: { orderBy: { createdAt: "desc" }, take: 100 },
		},
	});
	if (!lead) {
		throw new ORPCError("NOT_FOUND", { message: "Fiber lead not found" });
	}
	return lead;
}

export const listFiberLeads = protectedProcedure
	.route({
		method: "GET",
		path: "/fiber/leads",
		tags: ["Fiber"],
		summary: "List fiber leads",
	})
	.input(
		z.object({
			organizationId: z.string(),
			/** A stage, or OPEN for every stage still in play. */
			stage: z.enum([...FIBER_STAGES, "OPEN"]).default("OPEN"),
			area: z.string().optional(),
			source: z.enum(FIBER_SOURCES).optional(),
			/** An employee id, or "none" for unassigned. */
			assigneeId: z.string().optional(),
			overdue: z.boolean().optional(),
			search: z.string().trim().optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(10).max(100).default(50),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"marketing",
			"read",
		);
		const scope = leadScopeWhere(input.organizationId, activeDealerId);
		const and: Record<string, unknown>[] = [scope];
		if (input.area) {
			and.push({ area: input.area });
		}
		if (input.source) {
			and.push({ source: input.source });
		}
		if (input.assigneeId) {
			and.push({
				assigneeId:
					input.assigneeId === "none" ? null : input.assigneeId,
			});
		}
		if (input.overdue) {
			and.push({ nextActionAt: { lt: new Date() } });
		}
		if (input.search) {
			const phoneDigits = looksLikePhone(input.search)
				? phoneSearchDigits(input.search)
				: null;
			and.push({
				OR: [
					{ name: { contains: input.search, mode: "insensitive" } },
					{
						customer: {
							username: {
								contains: input.search,
								mode: "insensitive",
							},
						},
					},
					...(phoneDigits
						? [{ phone: { contains: phoneDigits } }]
						: []),
				],
			});
		}
		// Stage counts ignore the stage filter so the tabs always add up.
		const countWhere = { AND: and };
		const where = {
			AND: [
				...and,
				input.stage === "OPEN"
					? { stage: { in: OPEN_FIBER_STAGES } }
					: { stage: input.stage },
			],
		};

		const [leads, stageRows] = await Promise.all([
			db.fiberLead.findMany({
				where: where as never,
				select: {
					...LEAD_SELECT,
					activities: {
						orderBy: { createdAt: "desc" },
						take: 1,
						select: { type: true, body: true, createdAt: true },
					},
				},
				// Due follow-ups first, then whatever moved most recently.
				orderBy: [
					{ nextActionAt: { sort: "asc", nulls: "last" } },
					{ updatedAt: "desc" },
				],
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
			}),
			db.fiberLead.groupBy({
				by: ["stage"],
				where: countWhere as never,
				_count: { _all: true },
			}),
		]);

		const stageCounts = Object.fromEntries(
			stageRows.map((s) => [s.stage, s._count._all]),
		) as Partial<Record<FiberStage, number>>;
		const shown: readonly string[] =
			input.stage === "OPEN" ? OPEN_FIBER_STAGES : [input.stage];
		return {
			leads: leads.map(({ activities, ...l }) => ({
				...l,
				lastActivity: activities[0] ?? null,
			})),
			total: shown.reduce(
				(sum, st) => sum + (stageCounts[st as FiberStage] ?? 0),
				0,
			),
			stageCounts,
		};
	});

export const getFiberLead = protectedProcedure
	.route({
		method: "GET",
		path: "/fiber/leads/{id}",
		tags: ["Fiber"],
		summary: "Get a fiber lead with its timeline",
	})
	.input(z.object({ organizationId: z.string(), id: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"marketing",
			"read",
		);
		const { activities, ...lead } = await loadLead(
			input.organizationId,
			activeDealerId,
			input.id,
		);
		return { lead, activities };
	});

export const createFiberLead = protectedProcedure
	.route({
		method: "POST",
		path: "/fiber/leads",
		tags: ["Fiber"],
		summary: "Add a fiber lead by hand",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerId: z.string().optional(),
			name: z.string().trim().max(120).optional(),
			phone: z.string().trim().max(30).optional(),
			area: z.string().trim().max(120).optional(),
			notes: z.string().trim().max(2000).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"marketing",
			"manage",
		);
		let fields: ReturnType<typeof leadFieldsFromCustomer> | null = null;
		if (input.customerId) {
			const customer = await db.customer.findFirst({
				where: {
					id: input.customerId,
					organizationId: input.organizationId,
					...getDealerScopeFilter(activeDealerId),
				},
				select: { id: true, ...LEAD_CUSTOMER_SELECT },
			});
			if (!customer) {
				throw new ORPCError("NOT_FOUND", {
					message: "Customer not found",
				});
			}
			fields = leadFieldsFromCustomer(customer);
			const existing = await db.fiberLead.findUnique({
				where: {
					organizationId_customerId: {
						organizationId: input.organizationId,
						customerId: customer.id,
					},
				},
				select: { id: true },
			});
			if (existing) {
				return { id: existing.id, existed: true };
			}
		} else if (!input.name && !input.phone) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Give a name or a phone number",
			});
		}

		const lead = await db.fiberLead.create({
			data: {
				organizationId: input.organizationId,
				customerId: input.customerId ?? null,
				name: input.name || fields?.name || null,
				phone: input.phone
					? normalizePhone(input.phone)
					: (fields?.phone ?? null),
				area: input.area
					? normalizeArea(input.area)
					: (fields?.area ?? null),
				source: "MANUAL",
				notes: input.notes || null,
				createdById: user.id,
				activities: {
					create: {
						type: "NOTE",
						body: input.notes || "Added by hand",
						actorUserId: user.id,
						actorName: user.name,
					},
				},
			},
			select: { id: true },
		});
		return { id: lead.id, existed: false };
	});

export const updateFiberLead = protectedProcedure
	.route({
		method: "POST",
		path: "/fiber/leads/{id}",
		tags: ["Fiber"],
		summary: "Move a fiber lead, assign it, or edit its details",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			stage: z.enum(FIBER_STAGES).optional(),
			lostReason: z.enum(FIBER_LOST_REASONS).optional(),
			boxStatus: z.enum(FIBER_BOX_STATUSES).optional(),
			boxCode: z.string().trim().max(60).nullable().optional(),
			ogeroApproached: z.boolean().optional(),
			ogeroRequestRef: z.string().trim().max(60).nullable().optional(),
			assigneeId: z.string().nullable().optional(),
			nextActionAt: z.coerce.date().nullable().optional(),
			name: z.string().trim().max(120).nullable().optional(),
			phone: z.string().trim().max(30).nullable().optional(),
			area: z.string().trim().max(120).nullable().optional(),
			notes: z.string().trim().max(2000).nullable().optional(),
			/** Optional note logged with a stage change ("why lost"). */
			comment: z.string().trim().max(1000).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"marketing",
			"manage",
		);
		const lead = await loadLead(
			input.organizationId,
			activeDealerId,
			input.id,
		);
		const data: Record<string, unknown> = {};
		const activities: Array<Record<string, unknown>> = [];
		const actor = { actorUserId: user.id, actorName: user.name };

		if (input.nextActionAt !== undefined) {
			data["nextActionAt"] = input.nextActionAt;
		}
		const stageChanged = !!input.stage && input.stage !== lead.stage;
		if (input.stage && stageChanged) {
			if (input.stage === "LOST" && !input.lostReason) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Pick why this lead was lost",
				});
			}
			data["stage"] = input.stage;
			data["lostReason"] =
				input.stage === "LOST" ? input.lostReason : null;
			data["lostAt"] = input.stage === "LOST" ? new Date() : null;
			data["wonAt"] = input.stage === "WON" ? new Date() : null;
			// A closed lead has nothing left to follow up.
			if (input.stage === "WON" || input.stage === "LOST") {
				data["nextActionAt"] = null;
			}
			activities.push({
				type: "STAGE",
				fromStage: lead.stage,
				toStage: input.stage,
				body:
					input.comment ||
					`${FIBER_STAGE_LABELS[lead.stage as FiberStage] ?? lead.stage} → ${FIBER_STAGE_LABELS[input.stage]}`,
				...actor,
			});
		} else if (input.lostReason && lead.stage === "LOST") {
			data["lostReason"] = input.lostReason;
		}

		if (
			input.assigneeId !== undefined &&
			input.assigneeId !== lead.assigneeId
		) {
			let assigneeName = "nobody";
			if (input.assigneeId) {
				const employee = await db.employee.findFirst({
					where: {
						id: input.assigneeId,
						organizationId: input.organizationId,
						deletedAt: null,
					},
					select: { name: true },
				});
				if (!employee) {
					throw new ORPCError("NOT_FOUND", {
						message: "Employee not found",
					});
				}
				assigneeName = employee.name;
			}
			data["assigneeId"] = input.assigneeId;
			activities.push({
				type: "ASSIGN",
				body: `Assigned to ${assigneeName}`,
				...actor,
			});
		}

		for (const key of [
			"boxStatus",
			"boxCode",
			"ogeroApproached",
			"ogeroRequestRef",
			"name",
			"notes",
		] as const) {
			if (input[key] !== undefined) {
				data[key] = input[key] === "" ? null : input[key];
			}
		}
		if (input.phone !== undefined) {
			data["phone"] = input.phone ? normalizePhone(input.phone) : null;
		}
		if (input.area !== undefined) {
			data["area"] = normalizeArea(input.area);
		}
		if (input.ogeroApproached && !lead.ogeroApproached) {
			activities.push({
				type: "NOTE",
				body: "Marked: Ogero approached this customer",
				...actor,
			});
		}
		if (input.comment && !stageChanged) {
			activities.push({ type: "NOTE", body: input.comment, ...actor });
		}

		await db.fiberLead.update({
			where: { id: lead.id },
			data: {
				...data,
				activities: { create: activities as never },
			},
		});
		return { ok: true };
	});

export const logFiberContact = protectedProcedure
	.route({
		method: "POST",
		path: "/fiber/leads/{id}/activity",
		tags: ["Fiber"],
		summary: "Log a call, WhatsApp or note on a fiber lead",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			type: z.enum(["NOTE", "CALL", "WHATSAPP"]),
			body: z.string().trim().max(2000).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"marketing",
			"manage",
		);
		const lead = await loadLead(
			input.organizationId,
			activeDealerId,
			input.id,
		);
		const contacted = input.type !== "NOTE";
		if (!contacted && !input.body) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Write the note first",
			});
		}
		const actor = { actorUserId: user.id, actorName: user.name };
		const activities: Array<Record<string, unknown>> = [
			{
				type: input.type,
				body:
					input.body ||
					(input.type === "CALL" ? "Called" : "Sent a WhatsApp"),
				...actor,
			},
		];
		// Reaching a NEW lead is what "contacted" means — move it for them.
		const promote = contacted && lead.stage === "NEW";
		if (promote) {
			activities.push({
				type: "STAGE",
				fromStage: "NEW",
				toStage: "CONTACTED",
				body: "New → Contacted",
				...actor,
			});
		}
		await db.fiberLead.update({
			where: { id: lead.id },
			data: {
				...(contacted ? { lastContactAt: new Date() } : {}),
				...(promote ? { stage: "CONTACTED" } : {}),
				activities: { create: activities as never },
			},
		});
		return { ok: true };
	});

export const addCustomersToFiberPipeline = protectedProcedure
	.route({
		method: "POST",
		path: "/fiber/leads/bulk",
		tags: ["Fiber"],
		summary: "Open fiber leads for existing customers",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerIds: z.array(z.string()).min(1).max(5000),
			assigneeId: z.string().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"marketing",
			"manage",
		);
		const [customers, existing] = await Promise.all([
			db.customer.findMany({
				where: {
					id: { in: input.customerIds },
					organizationId: input.organizationId,
					...getDealerScopeFilter(activeDealerId),
				},
				select: { id: true, ...LEAD_CUSTOMER_SELECT },
			}),
			db.fiberLead.findMany({
				where: {
					organizationId: input.organizationId,
					customerId: { in: input.customerIds },
				},
				select: { customerId: true },
			}),
		]);
		if (input.assigneeId) {
			const assignee = await db.employee.findFirst({
				where: {
					id: input.assigneeId,
					organizationId: input.organizationId,
					deletedAt: null,
				},
				select: { id: true },
			});
			if (!assignee) {
				throw new ORPCError("NOT_FOUND", {
					message: "Employee not found",
				});
			}
		}
		const have = new Set(existing.map((l) => l.customerId));
		const fresh = customers.filter((c) => !have.has(c.id));
		// Two statements for any size; skipDuplicates covers a lead the signal
		// sweep opened meanwhile.
		const created = await db.$transaction(async (tx) => {
			const leads = await tx.fiberLead.createManyAndReturn({
				data: fresh.map((c) => ({
					organizationId: input.organizationId,
					customerId: c.id,
					...leadFieldsFromCustomer(c),
					source: "CUSTOMER_BASE",
					assigneeId: input.assigneeId ?? null,
					createdById: user.id,
				})),
				skipDuplicates: true,
				select: { id: true },
			});
			await tx.fiberLeadActivity.createMany({
				data: leads.map((l) => ({
					leadId: l.id,
					type: "NOTE",
					body: "Added from the defend list",
					actorUserId: user.id,
					actorName: user.name,
				})),
			});
			return leads.length;
		});
		const added = created;
		return { added, skipped: input.customerIds.length - added };
	});

/** The customer's fiber lead, if any — for the customer page card. */
export const getFiberLeadForCustomer = protectedProcedure
	.route({
		method: "GET",
		path: "/fiber/leads/by-customer/{customerId}",
		tags: ["Fiber"],
		summary: "Get a customer's fiber lead",
	})
	.input(z.object({ organizationId: z.string(), customerId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"marketing",
			"read",
		);
		const lead = await db.fiberLead.findFirst({
			where: {
				customerId: input.customerId,
				...leadScopeWhere(input.organizationId, activeDealerId),
			} as never,
			select: {
				id: true,
				stage: true,
				lostReason: true,
				nextActionAt: true,
				assignee: { select: { name: true } },
				activities: {
					orderBy: { createdAt: "desc" },
					take: 1,
					select: { body: true, createdAt: true },
				},
			},
		});
		return { lead };
	});
