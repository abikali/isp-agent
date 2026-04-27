import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import z from "zod";
import { publicProcedure } from "../../../orpc/procedures";

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

		return { payment };
	});
