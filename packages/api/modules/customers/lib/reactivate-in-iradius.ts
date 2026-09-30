import { ORPCError } from "@orpc/server";
import { logger } from "@repo/logs";
import {
	IRadiusExpiryChangedError,
	iradiusGetExpiry,
	iradiusLogExpiryAccount,
	iradiusRenewUser,
	iradiusSetActive,
	iradiusSetExpiryAccount,
} from "./iradius-api";

/** The literal + local Date an operator-picked expiry day becomes (23:59:00). */
export function customExpiryValues(day: string): {
	literal: string;
	date: Date;
} {
	// Same literal and time as `customers.setExpiryDate`.
	return {
		literal: `${day} 23:59:00`,
		date: new Date(`${day}T23:59:00.000Z`),
	};
}

/**
 * Parse an iRadius tz-naive "YYYY-MM-DD HH:MM:SS" the way the sync does
 * (`safeDate` in iradius-sync-helpers), so the value we store locally equals
 * what the next sync would write.
 */
export function parseIRadiusDateTime(value: string): Date {
	return new Date(value.replace(" ", "T"));
}

/**
 * Remote side of bringing a customer back in iRadius — shared by
 * `billing.reactivateAccount` and `billing.createInvoice`. Run it as the
 * `remote` step of `mirrorToIRadius`; the caller's `local` step then writes
 * the returned `expiresAt` (the value iRadius now holds).
 *
 *  a. `activate`: `UserNas.Active = 1` (+ the enable UserLog row).
 *  b. `renew`: read the live ExpiryAccount, then iRadius's own renew via the
 *     bridge (charges the dealer one period, expiry = max(expiry, now) +
 *     period). On failure the activation from (a) is undone and the error
 *     rethrown with iRadius's message.
 *  c. `customExpiryDate` (YYYY-MM-DD): `ExpiryAccount = <day> 23:59:00` + a
 *     UserLog line. Combined with a renew this re-asserts the operator's date
 *     over the renew's +1 period.
 *
 * Returns the final expiry written (custom, else the renewed one), or null
 * when the expiry was left unchanged. An unlinked customer makes no call.
 */
export async function reactivateInIRadius(opts: {
	customer: { externalId: string | null };
	activate: boolean;
	renew: boolean;
	customExpiryDate: string | null;
	reason: string;
}): Promise<{ expiresAt: Date | null }> {
	const { customer } = opts;
	const custom = opts.customExpiryDate
		? customExpiryValues(opts.customExpiryDate)
		: null;
	if (!customer.externalId) {
		return { expiresAt: custom?.date ?? null };
	}
	const userId = Number.parseInt(customer.externalId, 10);

	if (opts.activate) {
		await iradiusSetActive(customer, true);
	}

	// Undo (a) when a later step fails, so a refused reactivation does not
	// leave the subscriber enabled in iRadius while CP still shows it stopped.
	const undoActivation = async () => {
		if (!opts.activate) {
			return;
		}
		try {
			await iradiusSetActive(customer, false);
		} catch (error) {
			logger.error(
				"[iRadius reactivate] could not undo activation after a failed step",
				{ userId, error: String(error) },
			);
		}
	};

	let renewedExpiry: string | null = null;
	if (opts.renew) {
		try {
			const current = await iradiusGetExpiry(customer.externalId);
			({ newExpiry: renewedExpiry } = await iradiusRenewUser(
				customer,
				current,
			));
		} catch (error) {
			await undoActivation();
			if (error instanceof IRadiusExpiryChangedError) {
				throw new ORPCError("CONFLICT", {
					message: `${error.message} — nothing was charged; refresh and check the customer's expiry`,
				});
			}
			throw new ORPCError("BAD_GATEWAY", {
				message: `iRadius renew failed: ${error instanceof Error ? error.message : String(error)}`,
			});
		}
	}

	if (custom) {
		try {
			const { affectedRows } = await iradiusSetExpiryAccount(
				customer,
				custom.literal,
			);
			if (affectedRows !== 1) {
				throw new Error(`Expected 1 row updated, got ${affectedRows}`);
			}
		} catch (error) {
			if (renewedExpiry) {
				// The dealer was already charged; failing now would make the
				// operator retry and pay twice. Keep the renewed expiry and let
				// them correct the date from the customer page.
				logger.error(
					"[iRadius reactivate] custom expiry not written after renew — keeping the renewed expiry",
					{ userId, error: String(error) },
				);
				return { expiresAt: parseIRadiusDateTime(renewedExpiry) };
			}
			await undoActivation();
			throw error;
		}
		await iradiusLogExpiryAccount(userId, custom.literal, opts.reason);
		return { expiresAt: custom.date };
	}

	return {
		expiresAt: renewedExpiry ? parseIRadiusDateTime(renewedExpiry) : null,
	};
}
