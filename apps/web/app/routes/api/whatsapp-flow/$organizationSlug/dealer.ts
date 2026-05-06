import { db } from "@repo/database";
import { normalizeLebanesePhone } from "@repo/database/phones";
import { logger } from "@repo/logs";
import { createFileRoute } from "@tanstack/react-router";

const NOT_AVAILABLE = "notavailable";

function plainText(body: string): Response {
	return new Response(body, {
		status: 200,
		headers: { "Content-Type": "text/plain; charset=UTF-8" },
	});
}

// The local Lebanese number (without country code) is the most stable
// part of a phone across formats. iRadius mirrors phones in mixed
// shapes — "+96170442737", "70442737", "070442737", "03092449" — so
// suffix-matching on the local digits catches all of them in one query.
function extractCore(rawPhone: string): string {
	const normalized = normalizeLebanesePhone(rawPhone);
	const digits = normalized.replace(/\D/g, "");
	return digits.startsWith("961") ? digits.slice(3) : digits;
}

export const Route = createFileRoute(
	"/api/whatsapp-flow/$organizationSlug/dealer",
)({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const url = new URL(request.url);
				const rawPhone = url.searchParams.get("phone") ?? "";
				const core = extractCore(rawPhone);

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

				const customer = await db.customer.findFirst({
					where: {
						organizationId: organization.id,
						// A phone can be shared by multiple customer rows
						// (duplicates, historical records). Skip ones with
						// no dealer so we don't return "notavailable" while
						// a sibling row has the answer.
						dealerId: { not: null },
						OR: [
							{ mobile: { endsWith: core } },
							{ phone: { endsWith: core } },
						],
					},
					select: {
						id: true,
						dealer: { select: { username: true } },
					},
				});

				const dealerUsername = customer?.dealer?.username ?? null;

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
