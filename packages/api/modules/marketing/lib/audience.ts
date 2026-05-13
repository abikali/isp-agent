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

export const ispCustomersAudienceSchema = z.object({
	type: z.literal("isp_customers"),
	status: z.enum(CUSTOMER_LIST_STATUSES).optional(),
	planId: z.string().optional(),
	stationId: z.string().optional(),
	collectorId: z.string().optional(),
	groupName: z.string().optional(),
});

export const saltiGroupAudienceSchema = z.object({
	type: z.literal("salti_group"),
	groupId: z.string(),
	groupName: z.string().optional(),
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
	saltiGroupAudienceSchema,
	csvAudienceSchema,
	manualAudienceSchema,
]);

export type AudienceInput = z.infer<typeof audienceSchema>;

export interface MaterializedRecipient {
	customerId: string | null;
	phone: string;
	contactName: string | null;
	variables: Record<string, string>;
}

function normalizePhone(raw: string): string | null {
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
		return normalizePhone(c.mobile);
	}
	if (Array.isArray(c.phones)) {
		for (const entry of c.phones as Array<{ number?: string }>) {
			if (
				entry &&
				typeof entry === "object" &&
				typeof entry.number === "string"
			) {
				const n = normalizePhone(entry.number);
				if (n) {
					return n;
				}
			}
		}
	}
	if (c.phone) {
		return normalizePhone(c.phone);
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
 */
async function buildIspCustomerWhere(opts: {
	organizationId: string;
	permCtx: PermissionContext;
	activeDealerId: string | null;
	filters: z.infer<typeof ispCustomersAudienceSchema>;
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
	if (f.status === "EXPIRED") {
		where["status"] = "ACTIVE";
		where["expiresAt"] = { lt: new Date() };
	} else if (f.status === "ONLINE") {
		where["status"] = "ACTIVE";
		where["online"] = true;
	} else if (f.status === "OFFLINE") {
		where["status"] = "ACTIVE";
		where["online"] = false;
	} else if (f.status === "NEEDS_REVIEW") {
		Object.assign(where, CUSTOMER_NEEDS_REVIEW_WHERE);
	} else if (f.status) {
		where["status"] = f.status;
	}
	if (f.planId) {
		where["planId"] = f.planId;
	}
	if (f.stationId) {
		where["stationId"] = f.stationId;
	}
	if (f.collectorId === "none") {
		where["collectorId"] = null;
	} else if (f.collectorId) {
		where["collectorId"] = f.collectorId;
	}
	if (f.groupName) {
		where["groupName"] = f.groupName;
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

/**
 * Materialize ALL ISP-customer recipients for the actual send. Loads every
 * matching customer into memory — only call this from create-broadcast,
 * never from the live preview hot path.
 *
 * For "salti_group" audiences the recipients are fetched lazily by the
 * worker (we just record the groupId) because the membership list can be
 * large.
 */
export async function materializeIspCustomerRecipients(opts: {
	organizationId: string;
	permCtx: PermissionContext;
	activeDealerId: string | null;
	filters: z.infer<typeof ispCustomersAudienceSchema>;
}): Promise<MaterializedRecipient[]> {
	const where = await buildIspCustomerWhere(opts);

	const customers = await db.customer.findMany({
		where: where as never,
		select: CUSTOMER_RECIPIENT_SELECT,
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

/**
 * Fast preview for the ISP-customer audience: returns the exact deliverable
 * count + first `sampleSize` recipients without loading the full set into
 * memory. The count uses a phone-availability filter so it matches what
 * actually gets queued.
 *
 * For 50k-customer orgs this trims the per-keystroke load from "fetch
 * everything" to a `count()` + small `findMany`.
 */
export async function previewIspCustomerRecipients(opts: {
	organizationId: string;
	permCtx: PermissionContext;
	activeDealerId: string | null;
	filters: z.infer<typeof ispCustomersAudienceSchema>;
	sampleSize?: number;
}): Promise<{ total: number; sample: MaterializedRecipient[] }> {
	const sampleSize = opts.sampleSize ?? 10;
	const baseWhere = await buildIspCustomerWhere(opts);
	// Only count rows that have at least one phone column populated. We
	// don't try to read into the JSON `phones` array — see comment in
	// pickCustomerPhone. The under-count is bounded by customers who have
	// `phones[0]` but neither `mobile` nor `phone`, which is rare.
	const phoneAvailability = {
		OR: [{ mobile: { not: null } }, { phone: { not: null } }],
	};
	const countableWhere = { ...baseWhere, ...phoneAvailability };

	const [total, candidates] = await Promise.all([
		db.customer.count({ where: countableWhere as never }),
		// Over-fetch slightly so JSON-only-phones customers don't leave us
		// with an empty sample when `mobile`/`phone` are both null on the
		// first few rows.
		db.customer.findMany({
			where: baseWhere as never,
			select: CUSTOMER_RECIPIENT_SELECT,
			take: sampleSize * 3,
		}),
	]);

	const sample: MaterializedRecipient[] = [];
	for (const c of candidates) {
		const phone = pickCustomerPhone(c);
		if (!phone) {
			continue;
		}
		sample.push({
			customerId: c.id,
			phone,
			contactName:
				[c.firstName, c.lastName].filter(Boolean).join(" ") || null,
			variables: customerVariables(c),
		});
		if (sample.length >= sampleSize) {
			break;
		}
	}
	return { total, sample };
}

export function materializeCsvRecipients(
	rows: z.infer<typeof csvAudienceSchema>["rows"],
): MaterializedRecipient[] {
	const out: MaterializedRecipient[] = [];
	for (const row of rows) {
		const phone = normalizePhone(row.phone);
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
	const seen = new Set<string>();
	for (const raw of phones) {
		const phone = normalizePhone(raw);
		if (!phone || seen.has(phone)) {
			continue;
		}
		seen.add(phone);
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
 * Materialize recipients for the supported audience types.
 * For salti_group, returns an empty array (worker will fetch group members).
 */
export async function materializeAudience(
	opts: MaterializeOpts,
): Promise<MaterializedRecipient[]> {
	const a = opts.audience;
	if (a.type === "isp_customers") {
		return materializeIspCustomerRecipients({
			organizationId: opts.organizationId,
			permCtx: opts.permCtx,
			activeDealerId: opts.activeDealerId,
			filters: a,
		});
	}
	if (a.type === "csv") {
		return materializeCsvRecipients(a.rows);
	}
	if (a.type === "manual") {
		return materializeManualRecipients(a.phones);
	}
	return [];
}
