import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { toNationalDigits } from "@repo/utils";
import { createFileRoute } from "@tanstack/react-router";

const NOT_AVAILABLE = "notavailable";

function plainText(body: string): Response {
	return new Response(body, {
		status: 200,
		headers: { "Content-Type": "text/plain; charset=UTF-8" },
	});
}

export const Route = createFileRoute(
	"/api/whatsapp-flow/$organizationSlug/dealer",
)({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const url = new URL(request.url);
				const rawPhone = url.searchParams.get("phone") ?? "";
				// iRadius mirrors phones in mixed shapes ("+96170442737",
				// "70442737", "070442737"); suffix-match on national digits
				// catches all variants.
				const core = toNationalDigits(rawPhone);

				if (core.length < 7) {
					logger.info("[WhatsApp Flow] dealer lookup: bad phone", {
						orgSlug: params.organizationSlug,
						rawPhone,
					});
					return plainText(NOT_AVAILABLE);
				}

				const organization = await db.organization.findUnique({
					where: { slug: params.organizationSlug },
					select: { id: true },
				});

				if (!organization) {
					logger.info(
						"[WhatsApp Flow] dealer lookup: org not found",
						{
							orgSlug: params.organizationSlug,
							core,
						},
					);
					return plainText(NOT_AVAILABLE);
				}

				// Match against `mobile`, `phone`, AND every entry in the
				// `phones` JSON array. Customers with multiple numbers can
				// only be reached by the secondary number via the JSON
				// array — Prisma's `array_contains` requires exact match,
				// so we drop to raw SQL for a uniform suffix LIKE.
				// Skip rows with no dealer: a phone is sometimes shared by
				// duplicate rows, and we don't want to return "notavailable"
				// while a sibling row has the answer.
				const suffix = `%${core}`;
				const matches = await db.$queryRaw<
					Array<{ id: string; dealer_username: string | null }>
				>`
					SELECT c.id, d.username AS dealer_username
					FROM customer c
					LEFT JOIN isp_dealer d ON d.id = c."dealerId"
					WHERE c."organizationId" = ${organization.id}
					  AND c."dealerId" IS NOT NULL
					  AND (
					    c.mobile LIKE ${suffix}
					    OR c.phone LIKE ${suffix}
					    OR EXISTS (
					      SELECT 1 FROM jsonb_array_elements(c.phones) AS p
					      WHERE p->>'number' LIKE ${suffix}
					    )
					  )
					LIMIT 1
				`;

				const customer = matches[0] ?? null;
				const dealerUsername = customer?.dealer_username ?? null;

				logger.info("[WhatsApp Flow] dealer lookup", {
					orgSlug: params.organizationSlug,
					rawPhone,
					core,
					customerId: customer?.id ?? null,
					dealer: dealerUsername,
				});

				return plainText(dealerUsername ?? NOT_AVAILABLE);
			},
		},
	},
});
