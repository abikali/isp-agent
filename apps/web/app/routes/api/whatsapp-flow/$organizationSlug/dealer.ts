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

// Build the set of stored-phone variants we should match against.
// iRadius sync historically stores mobile in mixed formats — sometimes
// canonical "+961…", sometimes legacy local "79143071" or "03092449" —
// so a single normalized lookup misses real customers. Generate every
// reasonable variant for the input and match any of them.
function buildPhoneCandidates(digitsOnly: string): string[] {
	const local = digitsOnly.slice(3); // strip "961"
	// Lebanese mobiles starting with 3 historically carry a leading 0
	// in local form (`3092449` ↔ `03092449`).
	const localWithLeadingZero = local.startsWith("3") ? `0${local}` : local;
	return Array.from(
		new Set([
			`+${digitsOnly}`, // +96179143071
			digitsOnly, // 96179143071
			local, // 79143071
			localWithLeadingZero, // 03092449 (only when 3-prefix)
		]),
	);
}

export const Route = createFileRoute(
	"/api/whatsapp-flow/$organizationSlug/dealer",
)({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const url = new URL(request.url);
				const rawPhone = url.searchParams.get("phone") ?? "";
				const digitsOnly = rawPhone.replace(/\D/g, "");

				if (!digitsOnly.startsWith("961")) {
					logger.info("[WhatsApp Flow] dealer lookup: bad phone", {
						orgSlug: params.organizationSlug,
						rawPhone,
					});
					return plainText(NOT_AVAILABLE);
				}

				const normalizedPhone = normalizeLebanesePhone(digitsOnly);
				const candidates = buildPhoneCandidates(digitsOnly);

				const organization = await db.organization.findUnique({
					where: { slug: params.organizationSlug },
					select: { id: true },
				});

				if (!organization) {
					logger.info(
						"[WhatsApp Flow] dealer lookup: org not found",
						{
							orgSlug: params.organizationSlug,
							normalizedPhone,
						},
					);
					return plainText(NOT_AVAILABLE);
				}

				const customer = await db.customer.findFirst({
					where: {
						organizationId: organization.id,
						OR: [
							{ mobile: { in: candidates } },
							{ phone: { in: candidates } },
							...candidates.map((c) => ({
								phones: { array_contains: [{ number: c }] },
							})),
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
					normalizedPhone,
					candidates,
					customerId: customer?.id ?? null,
					dealer: dealerUsername,
				});

				return plainText(dealerUsername ?? NOT_AVAILABLE);
			},
		},
	},
});
