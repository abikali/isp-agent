import { randomBytes } from "node:crypto";
import { db } from "@repo/database";
import type { LocationRequestJobData } from "../types";
import { sendWhatsAppLocationRequest } from "./wpbox";

const TOKEN_BYTES = 24;
const REQUEST_TTL_DAYS = 7;

export interface CreateLocationRequestResult {
	ok: boolean;
	reason?: "customer_not_found" | "no_phone";
	whatsappSent?: boolean;
	token?: string;
	expiresAt?: Date;
}

function generateToken(): string {
	return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Creates (or reuses) a pending location-request token for a single
 * customer and sends the WhatsApp template. Always stamps
 * `customer.locationRequestedAt` so the UI can show "Last requested X ago"
 * and throttle visibly, even when an existing token is reused.
 *
 * Returns `whatsappSent: false` if the WPBox template send failed — the
 * LocationRequest row is still persisted so a retry or manual link share
 * is possible.
 *
 * Shared by the in-request `createLocationRequest` oRPC procedure (single
 * customer, sync) and the `location-request` BullMQ worker (bulk, async).
 * Rate limiting is the caller's concern — the worker controls concurrency
 * via BullMQ; the sync procedure serves one customer at a time.
 *
 * One combined DB roundtrip loads the customer together with their most
 * recent pending request, avoiding a separate `locationRequest.findFirst`.
 */
export async function runCreateLocationRequest(
	input: LocationRequestJobData,
): Promise<CreateLocationRequestResult> {
	const { organizationId, customerId, createdById } = input;
	const customer = await db.customer.findUnique({
		where: { id: customerId },
		select: {
			id: true,
			organizationId: true,
			firstName: true,
			mobile: true,
			phone: true,
			locationRequests: {
				where: {
					completedAt: null,
					expiresAt: { gt: new Date() },
				},
				orderBy: { createdAt: "desc" },
				take: 1,
				select: { token: true, expiresAt: true },
			},
		},
	});

	if (!customer || customer.organizationId !== organizationId) {
		return { ok: false, reason: "customer_not_found" };
	}
	const phone = customer.mobile ?? customer.phone;
	if (!phone) {
		return { ok: false, reason: "no_phone" };
	}

	const existing = customer.locationRequests[0];
	const token = existing?.token ?? generateToken();
	const expiresAt =
		existing?.expiresAt ??
		new Date(Date.now() + REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000);

	if (!existing) {
		await db.locationRequest.create({
			data: {
				organizationId,
				customerId,
				token,
				expiresAt,
				createdById,
			},
		});
	}

	await db.customer.update({
		where: { id: customerId },
		data: { locationRequestedAt: new Date() },
	});

	const whatsappSent = await sendWhatsAppLocationRequest({
		phone,
		token,
		customerName: customer.firstName,
	});

	return { ok: true, whatsappSent, token, expiresAt };
}
