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
							{ mobile: normalizedPhone },
							{ phone: normalizedPhone },
							{
								phones: {
									array_contains: [
										{ number: normalizedPhone },
									],
								},
							},
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
					customerId: customer?.id ?? null,
					dealer: dealerUsername,
				});

				return plainText(dealerUsername ?? NOT_AVAILABLE);
			},
		},
	},
});
