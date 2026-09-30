import { ORPCError } from "@orpc/server";
import { ispGet } from "@repo/ai/isp-api-client";
import {
	detectConnectionType,
	fetchInterfacePeers,
	filterCustomerData,
} from "@repo/ai/isp-search-customer";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { enrichDiagnosePeers } from "../lib/diagnose-peers";
import { getIspApiConfigFromEnv } from "../lib/iradius-api";

/**
 * The same live report the Telegram bot gives (`/user-info` on the iRadius
 * HTTP API, whitelisted to the fields a technician needs, plus a ping), for
 * the task detail and the customer page. Read-only.
 *
 * Peers are the bot's: everyone on the same building interface for fiber /
 * ether / base, otherwise the access point's users, each marked online,
 * expired (live iRadius expiry) or offline. ONU state is a separate query
 * (`customers.onuStatus`) because the OLT lookup takes seconds.
 *
 * No output schema on purpose: the ISP API mixes strings, booleans and
 * nulls for the same field (see CLAUDE.md, ISP tools). The UI renders the
 * sections generically.
 */
export const diagnoseCustomer = protectedProcedure
	.route({
		method: "GET",
		path: "/customers/diagnose",
		tags: ["Customers"],
		summary:
			"Live iRadius report for a customer (account, network, AP, ping)",
	})
	.input(z.object({ organizationId: z.string(), customerId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId, iradiusDisabled } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"read",
		);
		if (iradiusDisabled) {
			throw new ORPCError("BAD_REQUEST", {
				message: "iRadius is disabled for this organization.",
			});
		}
		const customer = await db.customer.findFirst({
			where: {
				id: input.customerId,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
			select: { username: true, externalId: true },
		});
		if (!customer) {
			throw new ORPCError("NOT_FOUND", { message: "Customer not found" });
		}
		if (!customer.username || !customer.externalId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Customer is not linked to iRadius",
			});
		}
		const config = getIspApiConfigFromEnv();
		if (!config) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "ISP API is not configured",
			});
		}

		const data = await ispGet<
			Record<string, unknown> | Record<string, unknown>[] | null
		>(config, "/user-info", { mobile: customer.username });
		const first = Array.isArray(data) ? data[0] : data;
		if (!first) {
			throw new ORPCError("NOT_FOUND", {
				message: "iRadius returned nothing for this username.",
			});
		}
		const report = filterCustomerData(first);
		const username = customer.username;

		const [ping, peerResult] = await Promise.all([
			ispGet<unknown>(config, "/user-ping", { mobile: username }).catch(
				() => null,
			),
			fetchInterfacePeers(config, report).catch(() => null),
		]);
		const peers = peerResult
			? await enrichDiagnosePeers({
					organizationId: input.organizationId,
					activeDealerId,
					peers: peerResult.peers,
				})
			: [];

		return {
			fetchedAt: new Date().toISOString(),
			connectionType: detectConnectionType(report),
			report,
			ping,
			peers,
			peerSource: peerResult?.source ?? null,
			peersError: peerResult === null,
		};
	});
