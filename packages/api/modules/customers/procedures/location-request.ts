import { randomBytes } from "node:crypto";
import { ORPCError } from "@orpc/server";
import {
	requirePermission,
	verifyCustomerOwnership,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure, publicProcedure } from "../../../orpc/procedures";
import { sendWhatsAppLocationRequest } from "../../billing/lib/whatsapp-receipt";

const TOKEN_BYTES = 24; // 32 chars after base64url encoding
const REQUEST_TTL_DAYS = 7;

function generateToken(): string {
	return randomBytes(TOKEN_BYTES).toString("base64url");
}

// ---------------------------------------------------------------------------
// Create a location request (admin / collector initiated)
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
		const { permCtx } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"update",
		);

		const customer = await db.customer.findFirst({
			where: {
				id: input.customerId,
				organizationId: input.organizationId,
			},
			select: {
				id: true,
				firstName: true,
				lastName: true,
				mobile: true,
				phone: true,
				collectorId: true,
			},
		});
		if (!customer) {
			throw new ORPCError("NOT_FOUND", { message: "Customer not found" });
		}
		await verifyCustomerOwnership(permCtx, "update", customer.collectorId);

		const phone = customer.mobile ?? customer.phone;
		if (!phone) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Customer has no phone number on file",
			});
		}

		// Reuse an existing pending request if it's still valid
		const existing = await db.locationRequest.findFirst({
			where: {
				customerId: input.customerId,
				completedAt: null,
				expiresAt: { gt: new Date() },
			},
			select: { token: true, expiresAt: true },
			orderBy: { createdAt: "desc" },
		});

		const token = existing?.token ?? generateToken();
		const expiresAt =
			existing?.expiresAt ??
			new Date(Date.now() + REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000);

		if (!existing) {
			await db.locationRequest.create({
				data: {
					organizationId: input.organizationId,
					customerId: input.customerId,
					token,
					expiresAt,
					createdById: user.id,
				},
			});
		}

		const sent = await sendWhatsAppLocationRequest({
			phone,
			token,
			customerName: customer.firstName,
		});

		if (!sent) {
			logger.warn("Location request: WhatsApp send failed", {
				customerId: input.customerId,
				phone,
			});
		}

		return {
			success: true,
			token,
			expiresAt,
			whatsappSent: sent,
		};
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

		await db.$transaction([
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
		]);

		return { success: true };
	});

// ---------------------------------------------------------------------------
// Get a location request by token (public — for the customer-facing page)
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
			throw new ORPCError("NOT_FOUND", {
				message: "Invalid link",
			});
		}
		const expired = request.expiresAt < new Date();
		return {
			expired,
			completed: request.completedAt !== null,
			customerFirstName: request.customer.firstName ?? null,
		};
	});
