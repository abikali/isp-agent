import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { notifyAdminTelegram } from "@repo/api/lib/notify-employee";
import {
	getDealerScopeFilter,
	getPermissionContext,
	resolveCollectorScope,
	verifyPermission,
} from "@repo/api/lib/permission";
import { db, getPrimaryPhone, MAX_PHONES, Prisma } from "@repo/database";
import { queueWhatsAppReceipt } from "@repo/jobs";
import { logger } from "@repo/logs";
import {
	notifyBadgeForOrganization,
	sendOrganizationNotification,
} from "@repo/notifications";
import { tgMessage } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	diffMirrorFields,
	type MirrorNextFields,
	pushMirrorDiffToIRadius,
} from "../../customers/lib/mirror-fields";
import { allocatePaymentAcrossInvoices } from "../lib/calculations";
import { fetchCustomerUnpaidInvoices } from "../lib/queries";
import { resolveActiveBillingMonth } from "../lib/resolve-month";
import { REVIEW_STOPPED_TASK_TITLE_PREFIX } from "../lib/review-tasks";

type PaymentRow = Awaited<ReturnType<typeof db.payment.create>>;

export const createPayment = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/payments",
		tags: ["Billing"],
		summary: "Record a payment collection",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerId: z.string(),
			collectorId: z.string(),
			accountPrice: z.number().finite().min(0),
			paidAmount: z.number().finite().min(0),
			discount: z.number().finite().min(0).default(0),
			freeAccount: z.boolean().default(false),
			stoppedAccount: z.boolean().default(false),
			debtAccount: z.boolean().default(false),
			workerId: z.string().optional(),
			noteCategory: z.string().optional(),
			notes: z.string().optional(),
			customerPhones: z
				.array(
					z.object({
						number: z.string().max(50),
						primary: z.boolean(),
					}),
				)
				.max(MAX_PHONES)
				.optional(),
			customerLatitude: z.number().finite().optional(),
			customerLongitude: z.number().finite().optional(),
			referredCustomerId: z.string().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const member = await verifyOrganizationMembership(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		const permCtx = getPermissionContext(
			user.id,
			input.organizationId,
			member.role,
			member.rolePermissions,
		);
		verifyPermission(permCtx, "billing", "collect");

		const { scope, employeeId } = await resolveCollectorScope(permCtx);
		if (scope === "own" && employeeId !== input.collectorId) {
			throw new ORPCError("FORBIDDEN", {
				message: "Can only record payments for your own collections",
			});
		}

		const activeDealerId = member.activeDealerId ?? null;
		const dealerFilter = getDealerScopeFilter(activeDealerId);

		const [customer, collector, worker, org] = await Promise.all([
			db.customer.findFirst({
				where: {
					id: input.customerId,
					organizationId: input.organizationId,
					...dealerFilter,
				},
			}),
			db.employee.findFirst({
				where: {
					id: input.collectorId,
					organizationId: input.organizationId,
					status: "ACTIVE",
					...dealerFilter,
				},
			}),
			input.workerId
				? db.employee.findFirst({
						where: {
							id: input.workerId,
							organizationId: input.organizationId,
							status: "ACTIVE",
							...dealerFilter,
						},
					})
				: Promise.resolve(null),
			db.organization.findUnique({
				where: { id: input.organizationId },
				select: { iradiusDisabled: true },
			}),
		]);
		const iradiusDisabled = org?.iradiusDisabled ?? false;
		if (!customer) {
			throw new ORPCError("NOT_FOUND", {
				message: "Customer not found",
			});
		}
		if (!collector) {
			throw new ORPCError("NOT_FOUND", {
				message: "Collector not found or inactive",
			});
		}
		if (input.workerId && !worker) {
			throw new ORPCError("NOT_FOUND", {
				message: "Worker not found or inactive",
			});
		}

		// Use the active billing month (latest unlocked)
		const billingMonth = await resolveActiveBillingMonth(
			input.organizationId,
		);

		if (billingMonth.locked) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Cannot create payments in a locked billing month",
			});
		}

		// A normal cash collection settles every currently-owed month, not just
		// the active one. A free settlement likewise waives every owed month —
		// otherwise mixing cash + free strands old months: cash fills oldest-
		// first while an active-month-only free leapfrogs to the current month,
		// leaving a middle month no collector action can ever clear. Stopped
		// keeps single-active-month semantics (separate review flow).
		const isCashCollection =
			!input.freeAccount && !input.stoppedAccount && input.paidAmount > 0;
		const settlesAllOwedMonths = isCashCollection || input.freeAccount;
		const { unpaid: unpaidInvoices, billedMonthCount } =
			settlesAllOwedMonths
				? await fetchCustomerUnpaidInvoices(
						input.organizationId,
						input.customerId,
						billingMonth.year,
						billingMonth.month,
					)
				: { unpaid: [], billedMonthCount: 0 };

		// Determine total due for validation. When the customer owes multiple
		// months, the amount due is the sum of every unpaid invoice (matches the
		// collector's prefilled total). Free settlements only owe addons, one
		// month's worth per waived month (mirrors the sheet's prefill). Falls
		// back to the single-month figure when there are no billed invoices
		// (addon-only collection).
		const singleMonthDue = input.freeAccount
			? (customer.iptvPrice ?? 0) + (customer.realIpPrice ?? 0)
			: input.accountPrice +
				(customer.iptvPrice ?? 0) +
				(customer.realIpPrice ?? 0) -
				input.discount;
		const accumulatedDue = unpaidInvoices.reduce((s, i) => s + i.amount, 0);
		const totalDue =
			unpaidInvoices.length > 0
				? input.freeAccount
					? singleMonthDue * unpaidInvoices.length
					: accumulatedDue
				: singleMonthDue;

		// Require a note for stopped accounts
		if (
			input.stoppedAccount &&
			!input.noteCategory &&
			!input.notes?.trim()
		) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"A note category or note is required when marking an account as stopped",
			});
		}

		if (input.freeAccount && input.stoppedAccount) {
			throw new ORPCError("BAD_REQUEST", {
				message: "A free account cannot be marked as stopped",
			});
		}

		// Debt ("dein") is a zero-cash visit log: the customer still owes and
		// promised to pay later. It must not combine with the settlement flags,
		// must carry a note, and any cash actually collected belongs in a
		// normal payment instead.
		if (input.debtAccount) {
			if (input.freeAccount || input.stoppedAccount) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"A debt cannot be combined with Free Account or Stopped",
				});
			}
			if (input.paidAmount > 0) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"Record collected cash as a normal payment — debt is for visits where nothing was collected",
				});
			}
			if (!input.noteCategory && !input.notes?.trim()) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"A note category or note is required when recording a debt",
				});
			}
		}

		// Reject "ghost" rows: paidAmount=0 with no flag set. They satisfy
		// the dedupe check but cover nothing (see lib/settlement.ts), so the
		// customer reappears in the unpaid list every month yet can never be
		// re-collected — they're stuck.
		if (
			input.paidAmount === 0 &&
			!input.freeAccount &&
			!input.stoppedAccount &&
			!input.debtAccount
		) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"Mark the payment as Free Account, Stopped, or Debt if no cash was collected",
			});
		}

		// Require a note when paid amount differs from total due
		const isAmountMismatch =
			Math.abs(input.paidAmount - totalDue) >= 0.01 &&
			!input.stoppedAccount &&
			input.paidAmount > 0;

		if (isAmountMismatch && !input.noteCategory && !input.notes?.trim()) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"A note category or note is required when the paid amount differs from the amount due",
			});
		}

		// Duplicate guard (also gates the iRadius push below so a double submit
		// never mirrors a phone/location change and then aborts). Cash and free
		// settle every currently-owed invoice, so a *duplicate* is a customer
		// who has invoices but nothing left owed. A partially-paid month is
		// NOT settled — collecting its remainder later is a normal follow-up,
		// not a duplicate. Stopped and no-invoice (addon-only) collections
		// stay one row per active month, so the old "already handled this
		// month" check still applies to them. This pre-transaction check is
		// best-effort UX; the authoritative re-check runs inside the
		// transaction under the advisory lock.
		if (settlesAllOwedMonths && billedMonthCount > 0) {
			if (unpaidInvoices.length === 0) {
				throw new ORPCError("CONFLICT", {
					message:
						"This customer is already settled for all billed months",
				});
			}
		} else {
			const existing = await db.payment.findFirst({
				where: {
					customerId: input.customerId,
					billingMonthId: billingMonth.id,
					OR: [
						{ paidAmount: { gt: 0 } },
						{ freeAccount: true },
						{ stoppedAccount: true },
					],
				},
				select: { id: true },
			});
			if (existing) {
				throw new ORPCError("CONFLICT", {
					message:
						"This customer already has a payment recorded for this billing month",
				});
			}
		}

		// Mirror the opportunistic customer enrichment (phones / location) the
		// collector entered on the payment sheet to iRadius *before* persisting
		// it locally — same remote-first, no-drift guarantee as the customer
		// edit form. Only touches iRadius when a field actually changed AND the
		// customer is linked, so a plain collection never depends on iRadius.
		const mirrorNext: MirrorNextFields = {};
		if (input.customerPhones && input.customerPhones.length > 0) {
			mirrorNext.phones = input.customerPhones;
		}
		if (
			input.customerLatitude !== undefined &&
			input.customerLongitude !== undefined
		) {
			mirrorNext.latitude = input.customerLatitude;
			mirrorNext.longitude = input.customerLongitude;
		}
		const mirrorDiff =
			!iradiusDisabled && customer.externalId
				? diffMirrorFields(customer, mirrorNext)
				: null;
		if (
			mirrorDiff &&
			customer.externalId &&
			(mirrorDiff.phonesChanged || mirrorDiff.locationChanged)
		) {
			await pushMirrorDiffToIRadius({
				externalId: customer.externalId,
				diff: mirrorDiff,
				next: mirrorNext,
				existing: customer,
			});
		}

		// Customer field updates (phones / location) applied once, whichever
		// settlement path runs.
		const customerUpdates: Record<string, unknown> = {};
		if (input.customerPhones && input.customerPhones.length > 0) {
			customerUpdates["phones"] = input.customerPhones;
			customerUpdates["mobile"] = getPrimaryPhone(input.customerPhones);
		}
		if (
			input.customerLatitude !== undefined &&
			input.customerLongitude !== undefined
		) {
			customerUpdates["latitude"] = input.customerLatitude;
			customerUpdates["longitude"] = input.customerLongitude;
		}

		// Create payment(s) in a transaction. A lump cash collection that covers
		// several owed months is split into one settlement row per month (oldest
		// first) so every owed invoice clears — not just the active month.
		let payment: PaymentRow;
		// Every row the lump settled — one per owed month. Each is receipted
		// on its own; see the receipt block below.
		let settledRows: PaymentRow[];
		try {
			const result = await db.$transaction(async (tx) => {
				// Serialize concurrent collections for the same customer. The
				// old `invoiceId @unique` constraint used to make a racing
				// double-submit fail atomically; with partial payments an
				// invoice can carry several rows, so the constraint is gone
				// and this per-customer lock (transaction-scoped, auto-freed
				// on commit/rollback) is what prevents a double submit from
				// allocating the same remainder twice.
				// Wrapped in a subselect: the lock function returns `void`,
				// which Prisma's row deserializer rejects — surface an int
				// column instead.
				await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`${input.organizationId}:${input.customerId}`}, 0))) AS t`;

				const baseData = {
					organizationId: input.organizationId,
					customerId: input.customerId,
					collectorId: input.collectorId,
					accountPrice: input.accountPrice,
					discount: input.discount,
					freeAccount: input.freeAccount,
					stoppedAccount: input.stoppedAccount,
					debtAccount: input.debtAccount,
					workerId: input.workerId ?? null,
					// Normalize to null when blank/whitespace so a non-note never
					// trips the `notes IS NOT NULL` needs-review predicate.
					noteCategory: input.noteCategory?.trim() || null,
					notes: input.notes?.trim() || null,
				};

				// Authoritative owed set, read under the lock — the pre-
				// transaction fetch only shaped validation and prefills.
				const freshUnpaid = settlesAllOwedMonths
					? (
							await fetchCustomerUnpaidInvoices(
								input.organizationId,
								input.customerId,
								billingMonth.year,
								billingMonth.month,
								tx,
							)
						).unpaid
					: [];
				if (
					settlesAllOwedMonths &&
					billedMonthCount > 0 &&
					freshUnpaid.length === 0
				) {
					throw new ORPCError("CONFLICT", {
						message:
							"This customer is already settled for all billed months",
					});
				}

				let created: PaymentRow[];

				// Validate referrer belongs to the same organization and
				// dealer (only when free account; ignored otherwise)
				if (input.referredCustomerId && input.freeAccount) {
					const referrer = await tx.customer.findFirst({
						where: {
							id: input.referredCustomerId,
							organizationId: input.organizationId,
							...getDealerScopeFilter(activeDealerId),
						},
						select: { id: true },
					});
					if (!referrer) {
						throw new ORPCError("BAD_REQUEST", {
							message: "Referred customer not found",
						});
					}
				}
				const referredId =
					input.freeAccount && input.referredCustomerId
						? input.referredCustomerId
						: null;

				if (settlesAllOwedMonths && freshUnpaid.length > 0) {
					// FIFO-allocate the lump across owed amounts, oldest first.
					// Each row's `amount` is the REMAINDER still owed on that
					// month, so a follow-up collection tops a partially-paid
					// invoice up instead of double-charging it. A free
					// settlement emits a row for every owed invoice (the
					// freeAccount row is what waives the month); cash only
					// where the money reaches.
					const allocation = allocatePaymentAcrossInvoices(
						input.paidAmount,
						freshUnpaid,
						{ coverAllInvoices: input.freeAccount },
					);
					created = [];
					for (const [i, a] of allocation.entries()) {
						const isLast = i === allocation.length - 1;
						created.push(
							await tx.payment.create({
								data: {
									...baseData,
									// The doorstep discount waives money ONCE —
									// stamping it on every split row would
									// multiply it in the coverage sums.
									discount: isLast ? input.discount : 0,
									billingMonthId: a.billingMonthId,
									invoiceId: a.invoiceId,
									paidAmount: a.amount,
									// Referral credit rides the newest settled
									// month, once.
									referredCustomerId: isLast
										? referredId
										: null,
								},
							}),
						);
					}
				} else {
					// Single row against the active month (stopped, or a cash/
					// free customer with no billed invoice — addon-only or
					// free-group). Race-safe dedupe re-check here.
					const existing = await tx.payment.findFirst({
						where: {
							customerId: input.customerId,
							billingMonthId: billingMonth.id,
							OR: [
								{ paidAmount: { gt: 0 } },
								{ freeAccount: true },
								{ stoppedAccount: true },
							],
						},
						select: { id: true },
					});
					if (existing) {
						throw new ORPCError("CONFLICT", {
							message:
								"This customer already has a payment recorded for this billing month",
						});
					}

					// Resolve the invoice this payment satisfies. Normally exists
					// because `openBillingMonth` generates an invoice for every
					// billable customer when the month opens; may be null for edge
					// cases (customer added or activated mid-month outside the
					// generator's eligibility, free-group customers collecting
					// addons). A debt row must NOT claim the invoice: invoiceId is
					// unique per payment, so linking it would block the later real
					// collection with a permanent CONFLICT.
					const invoice = input.debtAccount
						? null
						: await tx.customerInvoice.findFirst({
								where: {
									organizationId: input.organizationId,
									customerId: input.customerId,
									year: billingMonth.year,
									month: billingMonth.month,
									voidedAt: null,
								},
								select: { id: true },
							});

					created = [
						await tx.payment.create({
							data: {
								...baseData,
								billingMonthId: billingMonth.id,
								invoiceId: invoice?.id ?? null,
								paidAmount: input.paidAmount,
								referredCustomerId: referredId,
							},
						}),
					];
				}

				if (Object.keys(customerUpdates).length > 0) {
					await tx.customer.update({
						where: { id: input.customerId },
						data: customerUpdates,
					});
				}

				// Primary row (drives the receipt / activity log / response):
				// the active-month row when the lump reached it, else the newest
				// month settled.
				const primary =
					created.find((p) => p.billingMonthId === billingMonth.id) ??
					created[created.length - 1];
				if (!primary) {
					throw new ORPCError("INTERNAL_SERVER_ERROR", {
						message: "Payment creation produced no rows",
					});
				}
				return { primary, created };
			});
			payment = result.primary;
			settledRows = result.created;
		} catch (err) {
			// Belt-and-braces: the advisory lock serializes double-submits, and
			// the invoiceId unique constraint is dropped (partial payments), but
			// keep translating a stray P2002 into a friendly CONFLICT for the
			// deploy window where new code runs against the pre-migration schema.
			if (
				err instanceof Prisma.PrismaClientKnownRequestError &&
				err.code === "P2002"
			) {
				throw new ORPCError("CONFLICT", {
					message:
						"This customer already has a payment recorded for one of these months",
				});
			}
			throw err;
		}

		// Log payment creation activity on every settled row. A lump that
		// cleared three months produces three rows, and each one now carries
		// its own receipt entry — a row whose log opened with a receipt and no
		// creation entry would read as though it appeared from nowhere.
		const collectorName = collector.name;
		db.payment
			.updateMany({
				where: { id: { in: settledRows.map((row) => row.id) } },
				data: {
					activityLog: [
						{
							action: "payment_created",
							status: "success" as const,
							detail: `Recorded by ${collectorName}`,
							timestamp: new Date().toISOString(),
						},
					],
				},
			})
			.catch((err) =>
				logger.warn("[Payment] Failed to log creation activity", {
					error: String(err),
				}),
			);

		// Queue WhatsApp receipts via background worker (skip for stopped
		// accounts and debt visits — nothing was collected).
		//
		// One receipt per settled month, not one per collection. A lump that
		// clears several owed months creates a settlement row per month, and
		// the public /invoice/$paymentId page renders exactly one row: its
		// month, its invoice total, its allocated `paidAmount`. Receipting only
		// the primary row therefore sent the customer a single message naming
		// one month and a number smaller than what they actually handed over,
		// with the other months getting no record at all.
		if (!input.stoppedAccount && !input.debtAccount) {
			const phone = input.customerPhones
				? getPrimaryPhone(input.customerPhones)
				: (customer.mobile ?? customer.phone);
			if (phone) {
				for (const row of settledRows) {
					queueWhatsAppReceipt({ phone, paymentId: row.id }).catch(
						(err) =>
							logger.warn(
								"[WhatsApp Receipt] Failed to queue job",
								{ error: String(err), paymentId: row.id },
							),
					);
				}
			}
		}

		// If stopped, notify admins and create a task to disable on iRadius
		if (input.stoppedAccount) {
			const customerName =
				[customer.firstName, customer.lastName]
					.filter(Boolean)
					.join(" ") || customer.username;

			const org = await db.organization.findFirst({
				where: { id: input.organizationId },
				select: {
					slug: true,
					stoppedPaymentTaskEnabled: true,
					stoppedPaymentNotifyEnabled: true,
				},
			});

			const orgSlug = org?.slug ?? "";

			// Fire-and-forget notification (admin-configurable)
			if (org?.stoppedPaymentNotifyEnabled !== false) {
				sendOrganizationNotification(input.organizationId, {
					category: "monitoring",
					type: "warning",
					title: "Stopped Payment Needs Review",
					message: `${customerName} marked as stopped — review required before deactivation`,
					link: `/app/${orgSlug}/billing/payments`,
				}).catch((err) =>
					logger.warn(
						"[Stopped Account] Failed to send notification",
						{
							error: String(err),
						},
					),
				);
			}

			// Fire-and-forget task creation (admin-configurable)
			if (org?.stoppedPaymentTaskEnabled !== false) {
				const taskDescription =
					input.paidAmount > 0
						? `Customer "${customerName}" (${customer.username}) paid their final bill and requested to stop. Review and approve in Billing → Payments → Needs Review to deactivate.`
						: `Customer "${customerName}" (${customer.username}) requested to stop without payment. Review and approve in Billing → Payments → Needs Review to deactivate.`;

				db.task
					.create({
						data: {
							organizationId: input.organizationId,
							title: `${REVIEW_STOPPED_TASK_TITLE_PREFIX} ${customerName}`,
							description: taskDescription,
							priority: "HIGH",
							status: "OPEN",
							category: "BILLING",
							source: "SYSTEM",
							customerId: input.customerId,
							createdById: user.id,
						},
					})
					.catch((err) =>
						logger.warn("[Stopped Account] Failed to create task", {
							error: String(err),
						}),
					);
			}
		}

		notifyBadgeForOrganization(input.organizationId);

		// Admin Telegram alert (opt-in per org) when a collector records a payment.
		if (input.paidAmount > 0) {
			const payerName =
				[customer.firstName, customer.lastName]
					.filter(Boolean)
					.join(" ")
					.trim() ||
				customer.username ||
				"customer";
			const remainingDue = totalDue - input.paidAmount;
			notifyAdminTelegram(
				input.organizationId,
				"paymentCollected",
				tgMessage({
					icon: "💵",
					title: "Payment collected",
					fields: [
						{ icon: "👤", value: payerName },
						customer.username
							? {
									icon: "🆔",
									label: "Username",
									value: customer.username,
									copyable: true,
								}
							: null,
						{
							icon: "💰",
							label: "Amount",
							value: `$${input.paidAmount.toFixed(2)}`,
							copyable: true,
						},
						remainingDue > 0.001
							? {
									icon: "🧾",
									label: "Still due",
									value: `$${remainingDue.toFixed(2)}`,
									copyable: true,
								}
							: null,
						{ icon: "🤝", label: "By", value: collectorName },
					],
				}),
			);
		}

		return { payment };
	});
