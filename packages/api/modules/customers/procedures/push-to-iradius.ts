import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { buildIRadiusMobile, db } from "@repo/database";
import { getIRadiusPushQueue, queueIRadiusPush } from "@repo/jobs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	iradiusUpdateUserAddress,
	iradiusUpdateUserComment,
	iradiusUpdateUserEmail,
	iradiusUpdateUserLocation,
	iradiusUpdateUserName,
	iradiusUpdateUserPhones,
} from "../lib/iradius-api";

// ---------------------------------------------------------------------------
// Per-customer push (reconciliation primitive)
// ---------------------------------------------------------------------------

/**
 * Force-push every locally-authoritative field on a single customer to iRadius.
 * Useful as a per-customer recovery hook after a failed mirror.
 *
 * Pushed: firstName, lastName, email, phones (dash-joined into User.Mobile,
 * primary first, dedup), address, latitude, longitude, notes → iRadius
 * User / UserNas. `User.Phone` is intentionally left untouched.
 * Not pushed: username (PPPoE credential).
 */
export const pushCustomerToIRadius = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/iradius/push",
		tags: ["Customers"],
		summary: "Force-push a single customer's local data to iRadius",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId, iradiusDisabled } = await requirePermission(
			input.organizationId,
			user.id,
			"connections",
			"sync",
		);
		if (iradiusDisabled) {
			throw new ORPCError("BAD_REQUEST", {
				message: "iRadius is disabled for this organization",
			});
		}

		const customer = await db.customer.findFirst({
			where: {
				id: input.customerId,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
			select: {
				id: true,
				externalId: true,
				firstName: true,
				lastName: true,
				email: true,
				phones: true,
				address: true,
				latitude: true,
				longitude: true,
				notes: true,
			},
		});
		if (!customer) {
			throw new ORPCError("NOT_FOUND", { message: "Customer not found" });
		}
		if (!customer.externalId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Customer is not linked to iRadius",
			});
		}

		const stub = { externalId: customer.externalId };

		await iradiusUpdateUserName(
			stub,
			customer.firstName ?? "",
			customer.lastName ?? "",
		);
		await iradiusUpdateUserEmail(stub, customer.email ?? null);
		await iradiusUpdateUserPhones(
			stub,
			buildIRadiusMobile(customer.phones),
		);
		await iradiusUpdateUserAddress(stub, customer.address ?? null);
		await iradiusUpdateUserLocation(
			stub,
			customer.latitude ?? null,
			customer.longitude ?? null,
		);
		await iradiusUpdateUserComment(stub, customer.notes ?? null);

		return { customerId: customer.id };
	});

// ---------------------------------------------------------------------------
// Bulk push: queue BullMQ job that iterates all linked customers
// ---------------------------------------------------------------------------

export const startIRadiusPush = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/iradius/push/start",
		tags: ["Customers"],
		summary: "Queue a bulk push of every customer's local data to iRadius",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		const { iradiusDisabled } = await requirePermission(
			input.organizationId,
			user.id,
			"connections",
			"sync",
		);
		if (iradiusDisabled) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"iRadius is disabled for this organization — push cannot be triggered",
			});
		}

		// Guard against double-queueing
		const active = await db.iRadiusPushOperation.findFirst({
			where: {
				organizationId: input.organizationId,
				status: { in: ["pending", "in_progress"] },
			},
		});
		if (active) {
			throw new ORPCError("CONFLICT", {
				message:
					"A push is already in progress for this organization. Please wait for it to complete.",
			});
		}

		const operation = await db.iRadiusPushOperation.create({
			data: {
				organizationId: input.organizationId,
				status: "pending",
			},
		});

		await queueIRadiusPush({
			operationId: operation.id,
			organizationId: input.organizationId,
		});

		return { operationId: operation.id };
	});

export const cancelIRadiusPush = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/iradius/push/cancel",
		tags: ["Customers"],
		summary: "Cancel an active iRadius push operation",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"connections",
			"sync",
		);

		// We flip the DB status AND remove the BullMQ job. The worker polls
		// the status every PROGRESS_EVERY customers and bails when it sees
		// this flip — but if we don't also remove the job, a cancelled-but-
		// still-running job holds the worker's single concurrency slot and
		// blocks any newly queued push. `queue.remove` throws for active
		// jobs (the worker poll handles those), so we allSettled.
		const pending = await db.iRadiusPushOperation.findMany({
			where: {
				organizationId: input.organizationId,
				status: { in: ["pending", "in_progress"] },
			},
			select: { id: true },
		});

		const result = await db.iRadiusPushOperation.updateMany({
			where: {
				organizationId: input.organizationId,
				status: { in: ["pending", "in_progress"] },
			},
			data: {
				status: "failed",
				result: {
					errors: [
						{ phase: "cancelled", detail: "Cancelled by admin" },
					],
				},
				completedAt: new Date(),
			},
		});

		const queue = getIRadiusPushQueue();
		await Promise.allSettled(pending.map((op) => queue.remove(op.id)));

		return { cancelled: result.count };
	});

export const getIRadiusPushStatus = protectedProcedure
	.route({
		method: "GET",
		path: "/customers/iradius/push-status",
		tags: ["Customers"],
		summary: "Get the status of an iRadius push operation",
	})
	.input(
		z.object({
			organizationId: z.string(),
			operationId: z.string().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"connections",
			"sync",
		);

		const operation = input.operationId
			? await db.iRadiusPushOperation.findUnique({
					where: { id: input.operationId },
				})
			: await db.iRadiusPushOperation.findFirst({
					where: { organizationId: input.organizationId },
					orderBy: { createdAt: "desc" },
				});

		return { operation };
	});
