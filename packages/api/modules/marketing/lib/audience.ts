import {
	getDealerScopeFilter,
	getOwnershipFilterAsync,
	type PermissionContext,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { normalizePhone as projectNormalizePhone } from "@repo/utils";
import z from "zod";
import { CUSTOMER_NEEDS_REVIEW_WHERE } from "../../customers/lib/needs-review";
import { CUSTOMER_LIST_STATUSES } from "../../customers/lib/statuses";

const CONNECTION_TYPES = [
	"FIBER",
	"WIRELESS",
	"DSL",
	"CABLE",
	"ETHERNET",
] as const;

export const ispCustomersAudienceSchema = z.object({
	type: z.literal("isp_customers"),
	// Multi-select arrays. Empty array means "any". When multiple values are
	// supplied for the same dimension, they're OR'd together.
	statuses: z.array(z.enum(CUSTOMER_LIST_STATUSES)).default([]),
	planIds: z.array(z.string()).default([]),
	// Customers on these plans are left out (e.g. don't offer an upgrade to
	// people already on the top plan). Customers with no plan stay in.
	excludePlanIds: z.array(z.string()).default([]),
	stationIds: z.array(z.string()).default([]),
	collectorIds: z.array(z.string()).default([]),
	groupNames: z.array(z.string()).default([]),
	connectionTypes: z.array(z.enum(CONNECTION_TYPES)).default([]),
	// Renewal-window filter — customers whose `expiresAt` falls between now and
	// `now + expiresWithinDays`. Caps at 1 year of lookahead.
	expiresWithinDays: z.number().int().min(0).max(365).optional(),
	// Inclusive lower bound on `customer.balance`. Sign convention is left to
	// the operator (set to 0.01 for "owes any amount" if positive=debit, etc.).
	minBalance: z.number().optional(),
});

export const saltiGroupsAudienceSchema = z.object({
	type: z.literal("salti_group"),
	// One or more Salti group IDs. Old "groupId" singular field is migrated to
	// a 1-item array on read for back-compat with broadcasts stored before the
	// multi-group switch.
	groupIds: z.array(z.string()).min(1),
	groupNames: z.array(z.string()).default([]),
});

// Per-phone min-length is intentionally lax — the normalizer drops anything
// too short. Loose validation lets the live preview re-fire on every
// keystroke without throwing while the user is still typing.
export const csvAudienceSchema = z.object({
	type: z.literal("csv"),
	rows: z
		.array(
			z.object({
				phone: z.string(),
				name: z.string().optional(),
				variables: z.record(z.string(), z.string()).default({}),
			}),
		)
		.max(10000),
});

export const manualAudienceSchema = z.object({
	type: z.literal("manual"),
	phones: z.array(z.string()).max(2000),
});

export const audienceSchema = z.discriminatedUnion("type", [
	ispCustomersAudienceSchema,
	saltiGroupsAudienceSchema,
	csvAudienceSchema,
	manualAudienceSchema,
]);

export type AudienceInput = z.infer<typeof audienceSchema>;
export type IspCustomersAudience = z.infer<typeof ispCustomersAudienceSchema>;

export interface MaterializedRecipient {
	customerId: string | null;
	phone: string;
	contactName: string | null;
	variables: Record<string, string>;
}

/**
 * Canonical recipient phone (digits with country code), or null when the
 * input is too short to be a number. Recipient rows and suppression rows both
 * go through this so dedupe and opt-out exclusion can compare by equality.
 */
export function normalizeMarketingPhone(raw: string): string | null {
	const digits = raw.replace(/\D/g, "");
	if (digits.length < 6) {
		return null;
	}
	return projectNormalizePhone(raw);
}

function pickCustomerPhone(c: {
	mobile: string | null;
	phone: string | null;
	phones: unknown;
}): string | null {
	if (c.mobile) {
		return normalizeMarketingPhone(c.mobile);
	}
	if (Array.isArray(c.phones)) {
		for (const entry of c.phones as Array<{ number?: string }>) {
			if (
				entry &&
				typeof entry === "object" &&
				typeof entry.number === "string"
			) {
				const n = normalizeMarketingPhone(entry.number);
				if (n) {
					return n;
				}
			}
		}
	}
	if (c.phone) {
		return normalizeMarketingPhone(c.phone);
	}
	return null;
}

function customerVariables(c: {
	firstName: string | null;
	lastName: string | null;
	accountNumber: string;
	username: string | null;
	mobile: string | null;
}): Record<string, string> {
	return {
		"customer.firstName": c.firstName ?? "",
		"customer.lastName": c.lastName ?? "",
		"customer.fullName": [c.firstName, c.lastName]
			.filter(Boolean)
			.join(" "),
		"customer.accountNumber": c.accountNumber,
		"customer.username": c.username ?? "",
		"customer.mobile": c.mobile ?? "",
	};
}

interface MaterializeOpts {
	organizationId: string;
	permCtx: PermissionContext;
	activeDealerId: string | null;
	audience: AudienceInput;
}

/**
 * Build the Prisma `where` clause shared by the customer audience preview
 * (count + sample) and the full-materialization send path. One place for
 * the filter rules so preview and send can never diverge.
 *
 * For multi-select dimensions we OR within the dimension (Prisma `in`),
 * AND across dimensions (default behavior). NEEDS_REVIEW status uses the
 * shared `CUSTOMER_NEEDS_REVIEW_WHERE` clause; we don't try to mix
 * NEEDS_REVIEW with other statuses in the same broadcast because the
 * underlying conditions overlap in subtle ways.
 */
async function buildIspCustomerWhere(opts: {
	organizationId: string;
	permCtx: PermissionContext;
	activeDealerId: string | null;
	filters: IspCustomersAudience;
}): Promise<Record<string, unknown>> {
	const ownerFilter = await getOwnershipFilterAsync(
		opts.permCtx,
		"customers",
		"read",
	);
	const where: Record<string, unknown> = {
		organizationId: opts.organizationId,
		...ownerFilter,
		...getDealerScopeFilter(opts.activeDealerId),
	};

	const f = opts.filters;

	if (f.statuses.length > 0) {
		const realStatuses: string[] = [];
		const orBuckets: Array<Record<string, unknown>> = [];
		for (const s of f.statuses) {
			if (s === "EXPIRED") {
				orBuckets.push({
					status: "ACTIVE",
					expiresAt: { lt: new Date() },
				});
			} else if (s === "ONLINE") {
				orBuckets.push({ status: "ACTIVE", online: true });
			} else if (s === "OFFLINE") {
				orBuckets.push({ status: "ACTIVE", online: false });
			} else if (s === "NEEDS_REVIEW") {
				orBuckets.push(CUSTOMER_NEEDS_REVIEW_WHERE as never);
			} else {
				realStatuses.push(s);
			}
		}
		if (realStatuses.length > 0) {
			orBuckets.push({ status: { in: realStatuses } });
		}
		if (orBuckets.length === 1) {
			Object.assign(where, orBuckets[0]);
		} else if (orBuckets.length > 1) {
			where["AND"] = [
				...((where["AND"] as Array<Record<string, unknown>>) ?? []),
				{ OR: orBuckets },
			];
		}
	}

	if (f.planIds.length > 0) {
		where["planId"] = { in: f.planIds };
	}
	if (f.excludePlanIds.length > 0) {
		// `notIn` alone would also drop customers with no plan (SQL NOT IN
		// excludes NULL), so keep those explicitly.
		where["AND"] = [
			...((where["AND"] as Array<Record<string, unknown>>) ?? []),
			{
				OR: [{ planId: null }, { planId: { notIn: f.excludePlanIds } }],
			},
		];
	}
	if (f.stationIds.length > 0) {
		where["stationId"] = { in: f.stationIds };
	}
	if (f.collectorIds.length > 0) {
		const includesNone = f.collectorIds.includes("none");
		const real = f.collectorIds.filter((id) => id !== "none");
		if (includesNone && real.length > 0) {
			where["AND"] = [
				...((where["AND"] as Array<Record<string, unknown>>) ?? []),
				{ OR: [{ collectorId: null }, { collectorId: { in: real } }] },
			];
		} else if (includesNone) {
			where["collectorId"] = null;
		} else {
			where["collectorId"] = { in: real };
		}
	}
	if (f.groupNames.length > 0) {
		where["groupName"] = { in: f.groupNames };
	}
	if (f.connectionTypes.length > 0) {
		where["connectionType"] = { in: f.connectionTypes };
	}
	// expiresWithinDays overrides any expiry filter coming from status (set
	// by the EXPIRED expansion above) — they're contradictory ranges and the
	// renewal-window read is the more specific intent.
	if (f.expiresWithinDays !== undefined) {
		const now = new Date();
		const until = new Date(
			now.getTime() + f.expiresWithinDays * 86_400_000,
		);
		where["expiresAt"] = { gte: now, lte: until };
	}
	if (f.minBalance !== undefined) {
		where["balance"] = { gte: f.minBalance };
	}
	return where;
}

const CUSTOMER_RECIPIENT_SELECT = {
	id: true,
	firstName: true,
	lastName: true,
	accountNumber: true,
	username: true,
	mobile: true,
	phone: true,
	phones: true,
} as const;

export interface AudienceResolution {
	/** One row per distinct phone, opt-outs removed — exactly what gets queued. */
	recipients: MaterializedRecipient[];
	/** Rows dropped because an earlier row already had the same phone. */
	duplicateCount: number;
	/** Distinct phones dropped because they are on the opt-out list. */
	suppressedCount: number;
}

/**
 * Collapse candidates to one row per phone (first occurrence wins, so the
 * caller's ordering decides whose name/variables are used) and drop phones on
 * the opt-out list. Several customer accounts often share one owner's mobile;
 * without this the same person received the same promo two or three times.
 */
export function finalizeRecipients(
	candidates: MaterializedRecipient[],
	suppressedPhones: ReadonlySet<string>,
): AudienceResolution {
	const seen = new Set<string>();
	const recipients: MaterializedRecipient[] = [];
	let duplicateCount = 0;
	let suppressedCount = 0;
	for (const candidate of candidates) {
		if (seen.has(candidate.phone)) {
			duplicateCount += 1;
			continue;
		}
		seen.add(candidate.phone);
		if (suppressedPhones.has(candidate.phone)) {
			suppressedCount += 1;
			continue;
		}
		recipients.push(candidate);
	}
	return { recipients, duplicateCount, suppressedCount };
}

export async function loadSuppressedPhones(
	organizationId: string,
): Promise<Set<string>> {
	const rows = await db.marketingSuppression.findMany({
		where: { organizationId },
		select: { phone: true },
	});
	return new Set(rows.map((r) => r.phone));
}

/**
 * Every ISP customer matching the filters that has a usable phone, before
 * dedupe/opt-out. Oldest account first so a shared phone is addressed with
 * the original account holder's name.
 */
async function materializeIspCustomerRecipients(opts: {
	organizationId: string;
	permCtx: PermissionContext;
	activeDealerId: string | null;
	filters: IspCustomersAudience;
}): Promise<MaterializedRecipient[]> {
	const where = await buildIspCustomerWhere(opts);

	const customers = await db.customer.findMany({
		where: where as never,
		select: CUSTOMER_RECIPIENT_SELECT,
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
	});

	const out: MaterializedRecipient[] = [];
	for (const c of customers) {
		const phone = pickCustomerPhone(c);
		if (!phone) {
			continue;
		}
		out.push({
			customerId: c.id,
			phone,
			contactName:
				[c.firstName, c.lastName].filter(Boolean).join(" ") || null,
			variables: customerVariables(c),
		});
	}
	return out;
}

export function materializeCsvRecipients(
	rows: z.infer<typeof csvAudienceSchema>["rows"],
): MaterializedRecipient[] {
	const out: MaterializedRecipient[] = [];
	for (const row of rows) {
		const phone = normalizeMarketingPhone(row.phone);
		if (!phone) {
			continue;
		}
		out.push({
			customerId: null,
			phone,
			contactName: row.name ?? null,
			variables: row.variables ?? {},
		});
	}
	return out;
}

export function materializeManualRecipients(
	phones: string[],
): MaterializedRecipient[] {
	const out: MaterializedRecipient[] = [];
	for (const raw of phones) {
		const phone = normalizeMarketingPhone(raw);
		if (!phone) {
			continue;
		}
		out.push({
			customerId: null,
			phone,
			contactName: null,
			variables: {},
		});
	}
	return out;
}

/**
 * Resolve the recipients for an audience: materialise candidates, then dedupe
 * by phone and drop opt-outs. Used by the live preview and by every send path
 * so the previewed count is the queued count.
 *
 * For salti_group this is empty (Salti expands the group on its side).
 */
export async function materializeAudience(
	opts: MaterializeOpts,
): Promise<AudienceResolution> {
	const a = opts.audience;
	let candidates: MaterializedRecipient[] = [];
	if (a.type === "isp_customers") {
		candidates = await materializeIspCustomerRecipients({
			organizationId: opts.organizationId,
			permCtx: opts.permCtx,
			activeDealerId: opts.activeDealerId,
			filters: a,
		});
	} else if (a.type === "csv") {
		candidates = materializeCsvRecipients(a.rows);
	} else if (a.type === "manual") {
		candidates = materializeManualRecipients(a.phones);
	}
	if (candidates.length === 0) {
		return { recipients: [], duplicateCount: 0, suppressedCount: 0 };
	}
	return finalizeRecipients(
		candidates,
		await loadSuppressedPhones(opts.organizationId),
	);
}
