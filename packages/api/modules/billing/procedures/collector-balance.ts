import {
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { db, PaymentStatus } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	calculateInHandBalance,
	sumAmountOrZero,
	sumOrZero,
} from "../lib/calculations";

export const getCollectorBalance = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/collectors/balance",
		tags: ["Billing"],
		summary:
			"Calculate net balance for a collector (collected - handed off)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			collectorId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"view",
		);

		const dealerViaCustomer = getDealerScopeViaCustomer(activeDealerId);

		// All three metrics are running totals — NOT filtered by billing cycle.
		// "Total Collected", "Pending", and "Handed Off" must be on the same
		// basis for the balance math to work: In Hand = Pending - Handed Off.
		// Filtering payments by cycle but not handoffs would produce nonsensical
		// balances (e.g. $0 collected but $500 handed off).
		const [paymentsAgg, pendingAgg, collectionsAgg] = await Promise.all([
			db.payment.aggregate({
				where: {
					organizationId: input.organizationId,
					collectorId: input.collectorId,
					...dealerViaCustomer,
				},
				_sum: { paidAmount: true },
			}),
			db.payment.aggregate({
				where: {
					organizationId: input.organizationId,
					collectorId: input.collectorId,
					status: PaymentStatus.PENDING,
					...dealerViaCustomer,
				},
				_sum: { paidAmount: true },
			}),
			db.cashCollection.aggregate({
				where: {
					organizationId: input.organizationId,
					collectorId: input.collectorId,
				},
				_sum: { amount: true },
			}),
		]);

		const totalCollected = sumOrZero(paymentsAgg);
		const totalHandedOff = sumAmountOrZero(collectionsAgg);
		const pending = sumOrZero(pendingAgg);
		const balance = calculateInHandBalance(pending, totalHandedOff);

		return { totalCollected, totalHandedOff, balance };
	});
