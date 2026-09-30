import { ORPCError } from "@orpc/server";
import {
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { appendPaymentActivityLog, db } from "@repo/database";
import {
	buildNotificationRows,
	customerNotificationsAllowed,
	orgContactCandidates,
	pickContactPhone,
	queueCustomerNotifications,
} from "@repo/jobs";
import { parsePhone } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { receiptPhone } from "../lib/receipt-status";

/** A second click within this window is refused (double-click guard). */
export const STOP_NOTICE_COOLDOWN_MS = 10 * 60 * 1000;

const channelSchema = z.enum(["whatsapp", "sms"]);

/**
 * "Notify customer" on a pending stop (Needs review): before approving a
 * collector's stop, WhatsApp + SMS the customer that their collector is
 * trying to reach them, with the collector's number — a last chance to
 * answer. Stamps `Payment.stopNoticeSentAt` for the list badge and writes one
 * `CustomerNotification` row per channel, delivered by the customer-notify
 * worker. `dryRun` returns what would be sent (numbers + SMS text) for the
 * confirm popover without sending.
 *
 * Same operator grant as the expiry reminders — every send costs the
 * operator money. The marketing opt-out list is not applied (a manual,
 * one-off message); `suppressed` tells the UI to warn instead.
 */
export const sendStopNotice = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/stopped/notify",
		tags: ["Billing"],
		summary: "Notify a customer about a pending stop request",
	})
	.input(
		z.object({
			organizationId: z.string(),
			paymentId: z.string(),
			channels: z
				.array(channelSchema)
				.min(1)
				.default(["whatsapp", "sms"]),
			dryRun: z.boolean().default(false),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const [org, payment] = await Promise.all([
			db.organization.findUnique({
				where: { id: input.organizationId },
				select: {
					isWholesaleOperator: true,
					expiryReminderAllowed: true,
					reminderFallbackPhone: true,
					activeDealer: {
						select: { whatsappPhone: true, companyMobile: true },
					},
				},
			}),
			db.payment.findFirst({
				where: {
					id: input.paymentId,
					organizationId: input.organizationId,
					...getDealerScopeViaCustomer(activeDealerId),
				},
				select: {
					id: true,
					customerId: true,
					stoppedAccount: true,
					reviewedAt: true,
					stopNoticeSentAt: true,
					collector: { select: { phone: true } },
					customer: {
						select: {
							phones: true,
							mobile: true,
							phone: true,
							collectorPhone: true,
							collector: { select: { phone: true } },
						},
					},
				},
			}),
		]);

		if (!org) {
			throw new ORPCError("NOT_FOUND", {
				message: "Organization not found",
			});
		}
		if (!payment) {
			throw new ORPCError("NOT_FOUND", { message: "Payment not found" });
		}
		if (!payment.stoppedAccount || payment.reviewedAt !== null) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Not a pending stop",
			});
		}
		if (!customerNotificationsAllowed(org)) {
			throw new ORPCError("FORBIDDEN", {
				message:
					"Customer notifications are not enabled for this organization. Ask LibanCom to enable them.",
			});
		}

		const now = new Date();
		if (
			!input.dryRun &&
			payment.stopNoticeSentAt &&
			now.getTime() - payment.stopNoticeSentAt.getTime() <
				STOP_NOTICE_COOLDOWN_MS
		) {
			throw new ORPCError("TOO_MANY_REQUESTS", {
				message:
					"The customer was notified a few minutes ago. Wait before sending again.",
			});
		}

		const customerPhone = receiptPhone(payment.customer);
		const parsed = parsePhone(customerPhone);
		if (!parsed) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Customer has no phone",
			});
		}

		// The collector who filed the stop comes first: he is the one trying
		// to reach the customer.
		const contactPhone = pickContactPhone([
			payment.collector.phone,
			payment.customer.collector?.phone,
			payment.customer.collectorPhone,
			...orgContactCandidates(org),
		]);
		if (!contactPhone) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"No collector or office phone to put in the message. Set a fallback phone in Settings → Notifications.",
			});
		}

		const suppressed =
			(await db.marketingSuppression.count({
				where: {
					organizationId: input.organizationId,
					phone: parsed.digits,
				},
			})) > 0;

		const rows = buildNotificationRows({
			organizationId: input.organizationId,
			customerId: payment.customerId,
			paymentId: payment.id,
			kind: "stop_notice",
			channels: input.channels,
			customerPhone,
			contactPhone,
			sentById: user.id,
		});

		if (input.dryRun) {
			return {
				dryRun: true as const,
				sentAt: null,
				customerPhone: parsed.e164,
				contactPhone,
				smsText:
					rows.find((row) => row.channel === "sms")?.body ?? null,
				channels: rows.map((row) => ({
					channel: row.channel,
					status: row.status,
					error: row.error,
				})),
				suppressed,
			};
		}

		const created = await db.$transaction(async (tx) => {
			await tx.payment.update({
				where: { id: payment.id },
				data: { stopNoticeSentAt: now, stopNoticeSentById: user.id },
				select: { id: true },
			});
			await appendPaymentActivityLog(
				[payment.id],
				{
					action: "stop_notice",
					status: "success",
					detail: `queued ${input.channels.join("+")} → ${parsed.e164}, contact ${contactPhone}`,
					timestamp: now.toISOString(),
				},
				{ client: tx },
			);
			return tx.customerNotification.createManyAndReturn({
				data: rows,
				select: { id: true, channel: true, status: true, error: true },
			});
		});

		await queueCustomerNotifications(
			created
				.filter((row) => row.status === "queued")
				.map((row) => row.id),
		);

		return {
			dryRun: false as const,
			sentAt: now,
			customerPhone: parsed.e164,
			contactPhone,
			smsText: rows.find((row) => row.channel === "sms")?.body ?? null,
			channels: created.map((row) => ({
				channel: row.channel,
				status: row.status,
				error: row.error,
			})),
			suppressed,
		};
	});
