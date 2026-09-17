import { db, type Prisma } from "@repo/database";
import { logger } from "@repo/logs";
import { checkRateLimit } from "@repo/rate-limit";
import z from "zod";
import {
	authenticateOrgRequest,
	jsonResponse,
} from "../../api-keys/lib/authenticate-org-request";
import {
	MAX_QUERY_TOKENS,
	rankNameSearch,
	tokenizeSearchQuery,
} from "./name-search";
import { phoneSearchClauses } from "./phone-search";

/**
 * Customer directory search for the Telegram ISP bot.
 *
 * GET /api/customer-search/:organizationSlug?q=&limit=10&offset=0
 * Header `x-api-key` with `read:customers` (or `read:*` / `*`).
 *
 * `q` is a name / username fragment ("haj hassan", "ayman"), a phone number
 * (6+ digits) or an account number (`ACC-…`). Scope is the whole
 * organization — every dealer, not the dashboard's active-dealer view — so
 * staff can find any subscriber they would otherwise look up in iRadius.
 */

const QuerySchema = z.object({
	q: z.string().trim().min(2).max(64),
	limit: z.coerce.number().int().min(1).max(50).default(10),
	offset: z.coerce.number().int().min(0).default(0),
});

type MatchedOn = "username" | "name" | "similar" | "phone" | "account";

const detailSelect = {
	id: true,
	username: true,
	firstName: true,
	lastName: true,
	mobile: true,
	groupName: true,
	status: true,
	online: true,
	expiresAt: true,
	accountNumber: true,
	station: { select: { name: true } },
	plan: { select: { name: true } },
	dealer: { select: { name: true } },
} satisfies Prisma.CustomerSelect;

type CustomerDetail = Prisma.CustomerGetPayload<{
	select: typeof detailSelect;
}>;

function toResult(
	customer: CustomerDetail,
	matchedOn: MatchedOn,
	score: number,
) {
	const name = [customer.firstName, customer.lastName]
		.map((part) => part?.trim())
		.filter(Boolean)
		.join(" ");
	return {
		username: customer.username,
		name: name || null,
		mobile: customer.mobile,
		area: customer.groupName,
		station: customer.station?.name ?? null,
		plan: customer.plan?.name ?? null,
		status: customer.status,
		online: customer.online,
		expiresAt: customer.expiresAt?.toISOString() ?? null,
		dealer: customer.dealer?.name ?? null,
		accountNumber: customer.accountNumber,
		matchedOn,
		score,
	};
}

function looksLikePhone(q: string): boolean {
	return /^[\d\s+\-().]+$/.test(q) && q.replace(/\D/g, "").length >= 6;
}

export async function customerSearchHandler(
	request: Request,
	organizationSlug: string,
): Promise<Response> {
	const auth = await authenticateOrgRequest(
		request,
		organizationSlug,
		"read:customers",
	);
	if (!auth.ok) {
		return auth.response;
	}
	const { organizationId } = auth;

	const rate = await checkRateLimit("api", {
		type: "api-key",
		keyId: auth.apiKey.id,
	});
	if (!rate.allowed) {
		return jsonResponse(
			{ success: false, error: "Rate limit exceeded" },
			429,
			{ "Retry-After": String(rate.retryAfter) },
		);
	}

	const url = new URL(request.url);
	const parsed = QuerySchema.safeParse({
		q: url.searchParams.get("q") ?? "",
		limit: url.searchParams.get("limit") ?? undefined,
		offset: url.searchParams.get("offset") ?? undefined,
	});
	if (!parsed.success) {
		return jsonResponse(
			{
				success: false,
				error: "q must be 2-64 characters; limit 1-50; offset >= 0",
			},
			400,
		);
	}
	const { q, limit, offset } = parsed.data;

	const baseWhere: Prisma.CustomerWhereInput = {
		organizationId,
		deletedAt: null,
		NOT: { setupRequest: { status: "REJECTED" } },
		// iRadius leaves "Deleted User #123" rows behind. Wrapped in OR so a
		// customer with no first name is not dropped (NOT excludes NULLs).
		AND: [
			{
				OR: [
					{ firstName: null },
					{
						NOT: {
							firstName: {
								startsWith: "Deleted User",
								mode: "insensitive",
							},
						},
					},
				],
			},
		],
	};

	const noStore = { "Cache-Control": "no-store" };
	const startedAt = Date.now();

	// Phone number or account number: exact-ish lookups, no fuzzy ranking.
	let direct: {
		where: Prisma.CustomerWhereInput;
		matchedOn: MatchedOn;
	} | null = null;
	if (looksLikePhone(q)) {
		direct = {
			where: { ...baseWhere, OR: phoneSearchClauses(q) },
			matchedOn: "phone",
		};
	} else if (/^acc-/i.test(q)) {
		direct = {
			where: {
				...baseWhere,
				accountNumber: { contains: q, mode: "insensitive" },
			},
			matchedOn: "account",
		};
	}
	if (direct) {
		const { where, matchedOn } = direct;
		const [total, customers] = await Promise.all([
			db.customer.count({ where }),
			db.customer.findMany({
				where,
				select: detailSelect,
				orderBy: [{ status: "asc" }, { lastName: "asc" }],
				skip: offset,
				take: limit,
			}),
		]);
		return jsonResponse(
			{
				success: true,
				query: q,
				total,
				limit,
				offset,
				results: customers.map((c) => toResult(c, matchedOn, 90)),
			},
			200,
			noStore,
		);
	}

	const tokens = tokenizeSearchQuery(q);
	if (tokens.length === 0 || tokens.length > MAX_QUERY_TOKENS) {
		return jsonResponse(
			{
				success: false,
				error: `q needs 1-${MAX_QUERY_TOKENS} words of letters or digits`,
			},
			400,
		);
	}

	const candidates = await db.customer.findMany({
		where: baseWhere,
		select: {
			id: true,
			firstName: true,
			lastName: true,
			username: true,
			status: true,
			online: true,
		},
	});
	const hits = rankNameSearch(q, candidates);
	const page = hits.slice(offset, offset + limit);

	const details = await db.customer.findMany({
		where: { id: { in: page.map((hit) => hit.candidate.id) } },
		select: detailSelect,
	});
	const byId = new Map(details.map((c) => [c.id, c]));
	const results = page.flatMap((hit) => {
		const customer = byId.get(hit.candidate.id);
		return customer ? [toResult(customer, hit.matchedOn, hit.score)] : [];
	});

	logger.info("[Customer Search] name search", {
		organizationSlug,
		total: hits.length,
		ms: Date.now() - startedAt,
	});

	return jsonResponse(
		{ success: true, query: q, total: hits.length, limit, offset, results },
		200,
		noStore,
	);
}
