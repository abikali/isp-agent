import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
	resolveCollectorScope,
} from "@repo/api/lib/permission";
import {
	customerAudit,
	getAuditContextFromHeaders,
} from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import { isUsablePin } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { mirrorToIRadius } from "../../customers/lib/iradius-mirror";
import {
	diffMirrorFields,
	type MirrorNextFields,
	pushMirrorDiffToIRadius,
} from "../../customers/lib/mirror-fields";

/**
 * Collector-facing "Add pin": save the GPS pin captured at the customer's
 * door without recording a payment.
 *
 * Gated on `billing:collect` (collectors don't hold `customers:update`). An
 * own-scope collector may only pin customers assigned to them. The pin is a
 * mirrored personal-info field, so it goes to iRadius first and is written
 * locally only when that push succeeded.
 */
export const saveLocation = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/location/save",
		tags: ["Billing"],
		summary: "Save a customer's GPS pin from the collector app",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerId: z.string(),
			latitude: z.number().finite(),
			longitude: z.number().finite(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { permCtx, activeDealerId, iradiusDisabled } =
			await requirePermission(
				input.organizationId,
				user.id,
				"billing",
				"collect",
			);

		if (!isUsablePin(input.latitude, input.longitude)) {
			throw new ORPCError("BAD_REQUEST", {
				message: "That location is not valid — try again",
			});
		}

		const { scope, employeeId } = await resolveCollectorScope(permCtx);
		if (scope === "own" && !employeeId) {
			throw new ORPCError("FORBIDDEN", {
				message: "No employee record linked to your account",
			});
		}

		const customer = await db.customer.findFirst({
			where: {
				id: input.customerId,
				organizationId: input.organizationId,
				deletedAt: null,
				...getDealerScopeFilter(activeDealerId),
				...(scope === "own" && employeeId
					? { collectorId: employeeId }
					: {}),
			},
			select: {
				id: true,
				externalId: true,
				firstName: true,
				lastName: true,
				email: true,
				address: true,
				phones: true,
				groupExternalId: true,
				collectorId: true,
				latitude: true,
				longitude: true,
				notes: true,
			},
		});
		if (!customer) {
			throw new ORPCError("NOT_FOUND", { message: "Customer not found" });
		}

		const next: MirrorNextFields = {
			latitude: input.latitude,
			longitude: input.longitude,
		};
		const externalId = customer.externalId;
		const diff = diffMirrorFields(customer, next);

		await mirrorToIRadius({
			iradiusDisabled,
			logTag: "iRadius collector location save",
			failureMessage: "Failed to save the location to iRadius",
			remote: async () => {
				if (!externalId || !diff.locationChanged) {
					return;
				}
				await pushMirrorDiffToIRadius({
					externalId,
					diff,
					next,
					existing: customer,
				});
			},
			local: () =>
				db.customer.update({
					where: { id: customer.id },
					data: {
						latitude: input.latitude,
						longitude: input.longitude,
					},
					select: { id: true },
				}),
		});

		customerAudit.updated(
			customer.id,
			user.id,
			input.organizationId,
			getAuditContextFromHeaders(headers),
		);

		return { latitude: input.latitude, longitude: input.longitude };
	});
