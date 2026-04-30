import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
	verifyCustomerOwnership,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import {
	queueLocationRequestsBulk,
	runCreateLocationRequest,
} from "@repo/jobs";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure, publicProcedure } from "../../../orpc/procedures";
import { iradiusUpdateUserLocation } from "../lib/iradius-api";
import { mirrorToIRadius } from "../lib/iradius-mirror";

/**
 * Shared lifecycle guard for the customer-scoped location procedures:
 * permission check → existence check → ownership check. Throws the
 * correct oRPC error on each failure.
 */
async function assertCustomerUpdateAccess(
	organizationId: string,
	customerId: string,
	userId: string,
): Promise<void> {
	const { permCtx, activeDealerId } = await requirePermission(
		organizationId,
		userId,
		"customers",
		"update",
	);
	const customer = await db.customer.findFirst({
		where: {
			id: customerId,
			organizationId,
			...getDealerScopeFilter(activeDealerId),
		},
		select: { collectorId: true },
	});
	if (!customer) {
		throw new ORPCError("NOT_FOUND", { message: "Customer not found" });
	}
	await verifyCustomerOwnership(permCtx, "update", customer.collectorId);
}

// ---------------------------------------------------------------------------
// Create a single location request (admin-initiated)
// ---------------------------------------------------------------------------

export const createLocationRequest = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/location-request/create",
		tags: ["Customers"],
		summary:
			"Generate a location-request token and send a WhatsApp message to the customer",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await assertCustomerUpdateAccess(
			input.organizationId,
			input.customerId,
			user.id,
		);

		const result = await runCreateLocationRequest({
			organizationId: input.organizationId,
			customerId: input.customerId,
			createdById: user.id,
		});
		if (!result.ok) {
			if (result.reason === "no_phone") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Customer has no phone number on file",
				});
			}
			throw new ORPCError("NOT_FOUND", { message: "Customer not found" });
		}
		if (!result.whatsappSent) {
			logger.warn("Location request: WhatsApp send failed", {
				customerId: input.customerId,
			});
		}
		return {
			success: true,
			token: result.token,
			expiresAt: result.expiresAt,
			whatsappSent: result.whatsappSent,
		};
	});

// ---------------------------------------------------------------------------
// Bulk create location requests
// ---------------------------------------------------------------------------

export const bulkRequestLocation = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/location-request/bulk",
		tags: ["Customers"],
		summary:
			"Enqueue location-request jobs for multiple customers; worker delivers asynchronously with rate-limited concurrency",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerIds: z.array(z.string()).min(1).max(500),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"update",
		);

		// The worker only validates org membership, so we pre-filter here to
		// keep cross-dealer customer IDs out of the queue.
		const allowed = await db.customer.findMany({
			where: {
				id: { in: input.customerIds },
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
			select: { id: true },
		});

		const jobIds = await queueLocationRequestsBulk(
			allowed.map((c) => ({
				organizationId: input.organizationId,
				customerId: c.id,
				createdById: user.id,
			})),
		);

		return {
			success: true,
			queued: jobIds.length,
			skipped: input.customerIds.length - allowed.length,
		};
	});

// ---------------------------------------------------------------------------
// Manually set a customer's location (admin)
// ---------------------------------------------------------------------------

export const updateCustomerLocation = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/location/update",
		tags: ["Customers"],
		summary: "Set a customer's latitude/longitude manually",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerId: z.string(),
			latitude: z.number().finite().gte(-90).lte(90),
			longitude: z.number().finite().gte(-180).lte(180),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await assertCustomerUpdateAccess(
			input.organizationId,
			input.customerId,
			user.id,
		);
		const customer = await db.customer.findUnique({
			where: { id: input.customerId },
			select: { externalId: true },
		});
		await mirrorToIRadius({
			logTag: "iRadius update location",
			failureMessage: "Failed to update location in iRadius",
			remote: async () => {
				if (!customer?.externalId) {
					return;
				}
				await iradiusUpdateUserLocation(
					{ externalId: customer.externalId },
					input.latitude,
					input.longitude,
				);
			},
			local: () =>
				db.customer.update({
					where: { id: input.customerId },
					data: {
						latitude: input.latitude,
						longitude: input.longitude,
					},
				}),
		});
		return { success: true };
	});

// ---------------------------------------------------------------------------
// Clear a customer's location (admin)
// ---------------------------------------------------------------------------

export const clearCustomerLocation = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/location/clear",
		tags: ["Customers"],
		summary: "Clear a customer's latitude/longitude",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await assertCustomerUpdateAccess(
			input.organizationId,
			input.customerId,
			user.id,
		);
		const customer = await db.customer.findUnique({
			where: { id: input.customerId },
			select: { externalId: true },
		});
		await mirrorToIRadius({
			logTag: "iRadius clear location",
			failureMessage: "Failed to clear location in iRadius",
			remote: async () => {
				if (!customer?.externalId) {
					return;
				}
				await iradiusUpdateUserLocation(
					{ externalId: customer.externalId },
					null,
					null,
				);
			},
			local: () =>
				db.customer.update({
					where: { id: input.customerId },
					data: { latitude: null, longitude: null },
				}),
		});
		return { success: true };
	});

// ---------------------------------------------------------------------------
// Submit a location (public — customer-facing, no auth)
// ---------------------------------------------------------------------------

export const submitLocationByToken = publicProcedure
	.route({
		method: "POST",
		path: "/customers/location-request/submit",
		tags: ["Customers"],
		summary: "Submit a customer location via a public token link",
	})
	.input(
		z.object({
			token: z.string().min(8).max(64),
			latitude: z.number().finite().gte(-90).lte(90),
			longitude: z.number().finite().gte(-180).lte(180),
		}),
	)
	.handler(async ({ input }) => {
		const request = await db.locationRequest.findUnique({
			where: { token: input.token },
			select: {
				id: true,
				customerId: true,
				expiresAt: true,
				completedAt: true,
			},
		});
		if (!request) {
			throw new ORPCError("NOT_FOUND", {
				message: "Invalid or expired link",
			});
		}
		if (request.completedAt) {
			throw new ORPCError("BAD_REQUEST", {
				message: "This link has already been used",
			});
		}
		if (request.expiresAt < new Date()) {
			throw new ORPCError("BAD_REQUEST", {
				message: "This link has expired",
			});
		}

		const customer = await db.customer.findUnique({
			where: { id: request.customerId },
			select: { externalId: true },
		});

		await mirrorToIRadius({
			logTag: "iRadius submit location by token",
			failureMessage: "Failed to save location in iRadius",
			remote: async () => {
				if (!customer?.externalId) {
					return;
				}
				await iradiusUpdateUserLocation(
					{ externalId: customer.externalId },
					input.latitude,
					input.longitude,
				);
			},
			local: () =>
				db.$transaction([
					db.customer.update({
						where: { id: request.customerId },
						data: {
							latitude: input.latitude,
							longitude: input.longitude,
						},
					}),
					db.locationRequest.update({
						where: { id: request.id },
						data: { completedAt: new Date() },
					}),
				]),
		});

		return { success: true };
	});

// ---------------------------------------------------------------------------
// Look up a location request by token (public — for the customer page)
// ---------------------------------------------------------------------------

export const getLocationRequestByToken = publicProcedure
	.route({
		method: "GET",
		path: "/customers/location-request/by-token",
		tags: ["Customers"],
		summary: "Look up a location request by its public token",
	})
	.input(z.object({ token: z.string().min(8).max(64) }))
	.handler(async ({ input }) => {
		const request = await db.locationRequest.findUnique({
			where: { token: input.token },
			select: {
				id: true,
				expiresAt: true,
				completedAt: true,
				customer: {
					select: { firstName: true },
				},
			},
		});
		if (!request) {
			throw new ORPCError("NOT_FOUND", { message: "Invalid link" });
		}
		const expired = request.expiresAt < new Date();
		return {
			expired,
			completed: request.completedAt !== null,
			customerFirstName: request.customer.firstName ?? null,
		};
	});
