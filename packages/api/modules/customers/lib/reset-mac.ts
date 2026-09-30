import { type AuditContext, customerAudit } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import { iradiusResetMacAddress } from "./iradius-api";
import { mirrorToIRadius } from "./iradius-mirror";

/**
 * Reset a linked customer's MAC in iRadius (remote-first), clear the local
 * mirror, and audit it. Callers do their own authorization: the web action
 * checks the session's permission and ownership, the Telegram endpoint
 * checks the API key.
 */
export async function resetMacForCustomer(opts: {
	organizationId: string;
	customer: { id: string; externalId: string };
	actorUserId: string;
	auditContext: AuditContext;
	metadata: {
		via: "telegram" | "app";
		telegramId?: string | undefined;
		telegramName?: string | undefined;
		previousMac: string | null;
	};
}): Promise<void> {
	await mirrorToIRadius({
		logTag: "iRadius reset MAC",
		failureMessage: "Failed to reset MAC address in iRadius",
		remote: async () => {
			const result = await iradiusResetMacAddress(opts.customer);
			if (result.affectedRows !== 1) {
				throw new Error(
					`Expected 1 row updated, got ${result.affectedRows}`,
				);
			}
		},
		local: () =>
			db.customer.update({
				where: { id: opts.customer.id },
				data: { macAddress: null },
			}),
	});

	customerAudit.macReset(
		opts.customer.id,
		opts.actorUserId,
		opts.organizationId,
		opts.auditContext,
		opts.metadata,
	);
}
