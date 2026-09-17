import { ORPCError } from "@orpc/server";
import { dealerAudit, getAuditContextFromHeaders } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import { parsePhone } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	iradiusUpdateUserName,
	iradiusUpdateUserPhones,
} from "../../customers/lib/iradius-api";
import { mirrorToIRadius } from "../../customers/lib/iradius-mirror";
import { resolveDealerWhatsApp } from "../lib/notify-dealer";
import { requireDealerInScope, resolveDealerScope } from "../lib/scope";

/** Trim and collapse inner whitespace; empty → null. */
function clean(value: string | null | undefined): string | null {
	const text = (value ?? "").replace(/\s+/g, " ").trim();
	return text || null;
}

/**
 * iRadius stores the account name as FirstName + LastName and the sync joins
 * them with a space, so splitting at the first space round-trips exactly.
 */
export function splitDealerName(name: string): {
	firstName: string;
	lastName: string;
} {
	const [firstName = "", ...rest] = name.split(" ");
	return { firstName, lastName: rest.join(" ") };
}

/**
 * Fix who a dealer is and where their WhatsApp confirmations go.
 *
 * - `name` and `phone` are iRadius columns (User.FirstName/LastName,
 *   User.Mobile) that the 30-minute dealer sync overwrites, so they are
 *   written to iRadius first and mirrored locally only on success.
 * - `contactName` and `whatsappPhone` exist only here: the person to greet
 *   and the number to message, used ahead of the dirty iRadius phone fields.
 *
 * Omitted fields are left alone; null or "" clears.
 */
export const updateDealerContact = protectedProcedure
	.route({
		method: "POST",
		path: "/dealers/finance/{dealerId}/contact",
		tags: ["Dealers"],
		summary: "Update a dealer's name, phone and WhatsApp contact",
	})
	.input(
		z.object({
			organizationId: z.string(),
			dealerId: z.string(),
			/** iRadius account name. */
			name: z.string().trim().min(1).max(100).optional(),
			/** iRadius Mobile, free text as iRadius keeps it. */
			phone: z.string().max(50).nullable().optional(),
			contactName: z.string().max(100).nullable().optional(),
			whatsappPhone: z.string().max(30).nullable().optional(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const scope = await resolveDealerScope(
			input.organizationId,
			user.id,
			"manage",
		);
		if (!scope.canManage) {
			throw new ORPCError("FORBIDDEN", {
				message:
					"Only the network operator's organization can edit dealer contacts.",
			});
		}
		const dealer = await requireDealerInScope(scope, input.dealerId);

		const changes: Record<
			string,
			{ from: string | null; to: string | null }
		> = {};

		const name = input.name === undefined ? undefined : clean(input.name);
		if (name && name !== dealer.name) {
			changes["name"] = { from: dealer.name, to: name };
		}
		const phone =
			input.phone === undefined ? undefined : clean(input.phone);
		if (phone !== undefined && phone !== dealer.phone) {
			changes["phone"] = { from: dealer.phone, to: phone };
		}
		const contactName =
			input.contactName === undefined
				? undefined
				: clean(input.contactName);
		if (contactName !== undefined && contactName !== dealer.contactName) {
			changes["contactName"] = {
				from: dealer.contactName,
				to: contactName,
			};
		}
		let whatsappPhone: string | null | undefined;
		if (input.whatsappPhone !== undefined) {
			const raw = clean(input.whatsappPhone);
			if (raw) {
				const parsed = parsePhone(raw);
				if (!parsed) {
					throw new ORPCError("BAD_REQUEST", {
						message: `"${raw}" is not a valid WhatsApp number.`,
					});
				}
				whatsappPhone = parsed.e164;
			} else {
				whatsappPhone = null;
			}
			if (whatsappPhone !== dealer.whatsappPhone) {
				changes["whatsappPhone"] = {
					from: dealer.whatsappPhone,
					to: whatsappPhone,
				};
			}
		}

		const touchesIRadius = !!changes["name"] || !!changes["phone"];
		if (touchesIRadius) {
			// A local-only edit of these would be overwritten by the next sync.
			if (scope.iradiusDisabled) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"iRadius is disabled for this organization, so the dealer's name and phone cannot be changed here.",
				});
			}
			if (dealer.deletedAt || !dealer.externalId) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"This dealer is not in iRadius, so its name and phone cannot be changed.",
				});
			}
		}

		if (Object.keys(changes).length > 0) {
			await mirrorToIRadius({
				logTag: "iRadius dealer contact update",
				failureMessage:
					"iRadius did not accept the change. Nothing was saved — try again in a moment.",
				remote: async () => {
					if (name && changes["name"]) {
						const { firstName, lastName } = splitDealerName(name);
						const { affectedRows } = await iradiusUpdateUserName(
							dealer,
							firstName,
							lastName,
						);
						if (affectedRows === 0) {
							throw new ORPCError("NOT_FOUND", {
								message:
									"This dealer was not found in iRadius.",
							});
						}
					}
					if (phone !== undefined && changes["phone"]) {
						const { affectedRows } = await iradiusUpdateUserPhones(
							dealer,
							phone,
						);
						if (affectedRows === 0) {
							throw new ORPCError("NOT_FOUND", {
								message:
									"This dealer was not found in iRadius.",
							});
						}
					}
				},
				local: () =>
					db.ispDealer.update({
						where: { id: dealer.id },
						select: { id: true },
						data: {
							...(changes["name"] && name ? { name } : {}),
							// Clearing Mobile lets the sync fall back to
							// iRadius's Phone column on its next run.
							...(changes["phone"] && phone !== undefined
								? { phone }
								: {}),
							...(changes["contactName"] &&
							contactName !== undefined
								? { contactName }
								: {}),
							...(changes["whatsappPhone"] &&
							whatsappPhone !== undefined
								? { whatsappPhone }
								: {}),
						},
					}),
			});

			dealerAudit.contactUpdated(
				dealer.id,
				user.id,
				scope.organizationId,
				getAuditContextFromHeaders(headers),
				{ dealerName: name ?? dealer.name, changes },
			);
		}

		const whatsapp = resolveDealerWhatsApp({
			whatsappPhone:
				whatsappPhone === undefined
					? dealer.whatsappPhone
					: whatsappPhone,
			phone: phone === undefined ? dealer.phone : phone,
			companyMobile: dealer.companyMobile,
			companyPhone: dealer.companyPhone,
		});

		return {
			changed: Object.keys(changes),
			whatsappPhone:
				whatsapp.status === "ok" ? `+${whatsapp.phone}` : null,
		};
	});
