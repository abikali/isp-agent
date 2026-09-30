import { ORPCError } from "@orpc/server";
import { getOnuStatus, type OnuStatusResult } from "@repo/ai/onu-client";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * A fiber customer's ONU as the OLT sees it, fetched through the Telegram
 * bot (which owns the telnet sessions). Separate from `diagnose` because the
 * lookup takes seconds. Failures come back as `result: "error"`, never throw.
 */
export const onuStatus = protectedProcedure
	.route({
		method: "GET",
		path: "/customers/onu-status",
		tags: ["Customers"],
		summary: "Live ONU state for a fiber customer (via the Telegram bot)",
	})
	.input(z.object({ organizationId: z.string(), customerId: z.string() }))
	.handler(async ({ context: { user }, input }): Promise<OnuStatusResult> => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"read",
		);
		const customer = await db.customer.findFirst({
			where: {
				id: input.customerId,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
			select: { mikrotikInterface: true },
		});
		if (!customer) {
			throw new ORPCError("NOT_FOUND", { message: "Customer not found" });
		}
		if (!customer.mikrotikInterface) {
			return {
				applicable: false,
				olt: null,
				port: null,
				description: null,
				result: "not_found",
			};
		}
		return getOnuStatus(customer.mikrotikInterface, { timeoutMs: 30_000 });
	});
