import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import z from "zod";
import { publicProcedure } from "../../../orpc/procedures";
import {
	coverageKey,
	fetchCoverageMap,
	invoiceAmount,
	monthRemaining,
} from "../lib/settlement";

export const getInvoice = publicProcedure
	.route({
		method: "GET",
		path: "/billing/invoice/{paymentId}",
		tags: ["Billing"],
		summary: "Get public invoice details by payment ID",
	})
	.input(
		z.object({
			paymentId: z.string().min(1),
		}),
	)
	.handler(async ({ input }) => {
		const payment = await db.payment.findUnique({
			where: { id: input.paymentId },
			select: {
				id: true,
				organizationId: true,
				customerId: true,
				billingMonthId: true,
				accountPrice: true,
				paidAmount: true,
				discount: true,
				stoppedAccount: true,
				paidAt: true,
				createdAt: true,
				customer: {
					select: {
						firstName: true,
						lastName: true,
						username: true,
						iptvPrice: true,
						realIpPrice: true,
					},
				},
				invoice: {
					select: {
						accountPrice: true,
						iptvPrice: true,
						realIpPrice: true,
						discount: true,
						total: true,
						tax: true,
						totalWithTax: true,
						note: true,
					},
				},
				organization: {
					select: {
						name: true,
						logo: true,
					},
				},
				billingMonth: {
					select: {
						year: true,
						month: true,
					},
				},
				collector: {
					select: {
						name: true,
					},
				},
			},
		});

		if (!payment) {
			throw new ORPCError("NOT_FOUND", {
				message: "Invoice not found",
			});
		}

		// Month settlement for the receipt's Partial/Paid badge — sums every
		// covering payment on this (customer, billing month), not just the row
		// being receipted, so the second receipt of a topped-up month reads
		// Paid. Public route: expose only aggregates, never sibling rows.
		const monthTotal = payment.invoice
			? invoiceAmount(payment.invoice)
			: null;
		let settlement: {
			monthTotal: number;
			coveredTotal: number;
			remaining: number;
		} | null = null;
		if (monthTotal !== null) {
			const coverage = (
				await fetchCoverageMap(
					db,
					payment.organizationId,
					[payment.billingMonthId],
					[payment.customerId],
				)
			).get(coverageKey(payment.customerId, payment.billingMonthId));
			settlement = {
				monthTotal,
				coveredTotal: coverage?.covered ?? 0,
				remaining: monthRemaining(monthTotal, coverage),
			};
		}

		// Never leak internal ids through the public payload.
		const {
			organizationId: _org,
			customerId: _cust,
			billingMonthId: _bm,
			...publicPayment
		} = payment;

		return { payment: publicPayment, settlement };
	});
