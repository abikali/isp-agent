import { ORPCError } from "@orpc/server";
import { notifyFieldEmployee } from "@repo/api/lib/notify-employee";
import {
	getDealerScopeFilter,
	hasPermission,
	requirePermission,
} from "@repo/api/lib/permission";
import { db, type Prisma } from "@repo/database";
import { logger } from "@repo/logs";
import { bilingual, tgMessage } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { installationCostAmount } from "../../billing/lib/cash-signs";
import { mirrorToIRadius } from "../../customers/lib/iradius-mirror";
import { pushAddonPricesToIRadius } from "../lib/addon-price-mirror";
import { syncCustomerAddonPrice } from "../lib/addon-price-sync";
import { addonPriceFields } from "../lib/addons";
import { pushApElectricalToIRadius } from "../lib/electricity-mirror";
import { assertStockAvailable, decrementWorkerStock } from "../lib/stock-guard";

export const updatePendingInstallation = protectedProcedure
	.route({
		method: "PATCH",
		path: "/installations/{id}",
		tags: ["Installations"],
		summary: "Edit price/quantity of a pending installation",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			price: z.number().min(0).optional(),
			quantity: z.number().int().min(1).optional(),
			notes: z.string().max(500).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"installations",
			"update",
		);

		// Prices are admin-controlled (same rule as the sellPrice forcing on
		// create): without the approve permission a field tech could PATCH his
		// own pending line and defeat the forced sellPrice.
		if (
			input.price !== undefined &&
			!hasPermission(permCtx, "installations", "approve")
		) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only installation approvers can change prices",
			});
		}

		const installation = await db.installation.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				employee: getDealerScopeFilter(activeDealerId),
			},
			select: {
				id: true,
				status: true,
				isAddOn: true,
				notes: true,
				setupRequestId: true,
				quantity: true,
				stockItemId: true,
				employeeId: true,
			},
		});
		if (!installation) {
			throw new ORPCError("NOT_FOUND", {
				message: "Installation not found",
			});
		}
		if (installation.status !== "PENDING") {
			throw new ORPCError("CONFLICT", {
				message: "Only pending installations can be edited",
			});
		}

		const quantityChanged =
			input.quantity !== undefined &&
			input.quantity !== installation.quantity;
		if (quantityChanged) {
			// Quantity decides how much stock the approval consumes, so it is an
			// approver's call — the field role holds installations:update and
			// could otherwise inflate or shrink any pending line via the API.
			if (!hasPermission(permCtx, "installations", "approve")) {
				throw new ORPCError("FORBIDDEN", {
					message:
						"Only installation approvers can change quantities",
				});
			}
			if (installation.isAddOn) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Add-ons have no quantity",
				});
			}
		}
		// Only an increase can overdraw the worker; lowering always fits.
		if (
			input.quantity !== undefined &&
			input.quantity > installation.quantity &&
			installation.stockItemId
		) {
			await assertStockAvailable(db, {
				employeeId: installation.employeeId,
				lines: [
					{
						stockItemId: installation.stockItemId,
						quantity: input.quantity,
					},
				],
				reserve: true,
				excludeInstallationIds: [installation.id],
				audience: "admin",
			});
		}

		const updateData: Record<string, unknown> = {};
		if (input.price !== undefined) {
			updateData["price"] = input.price;
		}
		if (quantityChanged) {
			updateData["quantity"] = input.quantity;
		}
		if (input.notes !== undefined && !installation.isAddOn) {
			updateData["notes"] = input.notes;
		}

		const updated = await db.$transaction(async (tx) => {
			if (input.price !== undefined && installation.isAddOn) {
				await syncCustomerAddonPrice(tx, installation, input.price);
			}
			return tx.installation.update({
				where: { id: input.id },
				data: updateData,
			});
		});

		return { installation: updated };
	});

/**
 * Approve a pending installation inside a transaction. Shared with the
 * customer setup-request approval (which approves the bundle without
 * per-line cash entries).
 *
 * The line is claimed first (PENDING → APPROVED, conditional on the status),
 * so two concurrent approvals of the same line — or a setup approval racing
 * a line that changed state since it was read — cannot both consume stock
 * and log cash: the loser throws CONFLICT and its transaction rolls back.
 *
 * Stock rule: worker stock decrements HERE (at approval), never at create.
 * The decrement is atomic (conditional update), so concurrent approvals of
 * the same worker's different lines cannot overdraw him.
 */
export async function approveInstallationInTx(
	tx: Prisma.TransactionClient,
	installation: {
		id: string;
		organizationId: string;
		employeeId: string;
		customerId: string | null;
		stockItemId: string | null;
		isAddOn: boolean;
		quantity: number;
		price: number;
		notes: string | null;
	},
	userId: string,
	options: { createCashEntry: boolean },
): Promise<void> {
	const claimed = await tx.installation.updateMany({
		where: { id: installation.id, status: "PENDING" },
		data: {
			status: "APPROVED",
			approvedById: userId,
			approvedAt: new Date(),
		},
	});
	if (claimed.count !== 1) {
		throw new ORPCError("CONFLICT", {
			message:
				"This installation was already reviewed — refresh the list",
		});
	}

	// Consume worker stock for physical items
	let stockItemName: string | null = null;
	if (installation.stockItemId && !installation.isAddOn) {
		const moved = await decrementWorkerStock(tx, {
			stockItemId: installation.stockItemId,
			employeeId: installation.employeeId,
			quantity: installation.quantity,
		});
		if (!moved) {
			// Throws with the item / worker named; the fallback only fires if
			// the holding changed between the two statements.
			await assertStockAvailable(tx, {
				employeeId: installation.employeeId,
				lines: [installation],
				reserve: false,
				audience: "admin",
			});
			throw new ORPCError("CONFLICT", {
				message:
					"Worker lacks stock for this item — deliver stock first or edit the quantity",
			});
		}
		const stockItem = await tx.stockItem.findUniqueOrThrow({
			where: { id: installation.stockItemId },
			select: { name: true, isElectricity: true },
		});
		stockItemName = stockItem.name;
		// An electricity item means the customer powers our AP. Callers push
		// UserNas.APElectrical first (`pushApElectricalToIRadius`, remote-first).
		if (stockItem.isElectricity && installation.customerId) {
			await tx.customer.update({
				where: { id: installation.customerId },
				data: { apElectrical: true },
			});
		}
		await tx.stockLog.create({
			data: {
				organizationId: installation.organizationId,
				stockItemId: installation.stockItemId,
				employeeId: installation.employeeId,
				performedById: userId,
				action: "REMOVE",
				itemName: stockItem.name,
				quantity: installation.quantity,
				workerQtyBefore: moved.before,
				workerQtyAfter: moved.after,
				notes: `Consumed by installation ${installation.id}`,
			},
		});
	}

	// Add-on approval updates the customer's recurring add-on price. iptvPrice
	// / realIpPrice are iRadius-mirrored: every caller must push the same
	// prices with `pushAddonPricesToIRadius` BEFORE opening this transaction
	// (remote-first), so this local write never runs after a failed push.
	const addonPrices = addonPriceFields([installation]);
	if (installation.customerId && Object.keys(addonPrices).length > 0) {
		await tx.customer.update({
			where: { id: installation.customerId },
			data: addonPrices,
		});
	}

	// Cash ledger: hardware/add-on money the worker collected
	const total = installation.price * installation.quantity;
	if (options.createCashEntry && total > 0) {
		const customer = installation.customerId
			? await tx.customer.findUnique({
					where: { id: installation.customerId },
					select: { firstName: true, lastName: true, username: true },
				})
			: null;
		const customerName = customer
			? `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim() ||
				customer.username
			: null;
		const item = installation.isAddOn ? installation.notes : stockItemName;
		const detail = [
			customerName,
			item && installation.quantity > 1
				? `${item} ×${installation.quantity}`
				: item,
		]
			.filter(Boolean)
			.join(" · ");
		await tx.cashCollection.create({
			data: {
				organizationId: installation.organizationId,
				collectorId: installation.employeeId,
				amount: installationCostAmount(total),
				type: "INSTALLATION_COST",
				// Links the ledger entry to its installation so deleting the
				// entry can revert the approval (restore consumed stock).
				installationId: installation.id,
				receivedById: userId,
				notes: detail
					? `Approved installation — ${detail}`
					: `Approved installation ${installation.id}`,
			},
		});
	}
}

/**
 * Inverse of `approveInstallationInTx`: return the consumed stock to the
 * worker and move the installation out of APPROVED. Add-on approvals keep the
 * customer's recurring price (there is no reliable "previous" value to
 * restore); re-approving re-applies it.
 *
 * - Deleting the installation's cash-ledger entry (the default) puts the line
 *   back to PENDING so it can be edited, re-approved or denied; the caller
 *   deletes the cash row itself.
 * - Rejecting a task completion passes `deleteCashEntry: true` and
 *   `finalStatus: "DENIED"`: the worker resubmits fresh lines, so this one is
 *   closed and its INSTALLATION_COST row removed here.
 */
export async function revertApprovedInstallation(
	tx: Prisma.TransactionClient,
	installationId: string,
	userId: string,
	options: {
		deleteCashEntry: boolean;
		finalStatus: "PENDING" | "DENIED";
		reason: string;
	} = {
		deleteCashEntry: false,
		finalStatus: "PENDING",
		reason: "cash entry deleted",
	},
): Promise<void> {
	const installation = await tx.installation.findUnique({
		where: { id: installationId },
		select: {
			id: true,
			organizationId: true,
			employeeId: true,
			stockItemId: true,
			isAddOn: true,
			quantity: true,
			status: true,
		},
	});
	if (!installation || installation.status !== "APPROVED") {
		return;
	}

	if (installation.stockItemId && !installation.isAddOn) {
		const allocation = await tx.workerStock.upsert({
			where: {
				stockItemId_employeeId: {
					stockItemId: installation.stockItemId,
					employeeId: installation.employeeId,
				},
			},
			create: {
				stockItemId: installation.stockItemId,
				employeeId: installation.employeeId,
				quantity: installation.quantity,
			},
			update: { quantity: { increment: installation.quantity } },
			select: { quantity: true },
		});
		const stockItem = await tx.stockItem.findUniqueOrThrow({
			where: { id: installation.stockItemId },
			select: { name: true },
		});
		await tx.stockLog.create({
			data: {
				organizationId: installation.organizationId,
				stockItemId: installation.stockItemId,
				employeeId: installation.employeeId,
				performedById: userId,
				action: "ADD",
				itemName: stockItem.name,
				quantity: installation.quantity,
				workerQtyBefore: allocation.quantity - installation.quantity,
				workerQtyAfter: allocation.quantity,
				notes:
					options.finalStatus === "DENIED"
						? `Returned — ${options.reason} (installation ${installation.id})`
						: `Returned — approved installation ${installation.id} reverted (${options.reason})`,
			},
		});
	}

	if (options.deleteCashEntry) {
		await tx.cashCollection.deleteMany({
			where: { installationId: installation.id },
		});
	}

	await tx.installation.update({
		where: { id: installation.id },
		data:
			options.finalStatus === "DENIED"
				? {
						status: "DENIED",
						approvedById: userId,
						approvedAt: new Date(),
					}
				: {
						status: "PENDING",
						approvedById: null,
						approvedAt: null,
					},
	});
}

export const approveInstallations = protectedProcedure
	.route({
		method: "POST",
		path: "/installations/approve",
		tags: ["Installations"],
		summary: "Approve pending installations (consumes worker stock)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			ids: z.array(z.string()).min(1).max(50),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId, iradiusDisabled } = await requirePermission(
			input.organizationId,
			user.id,
			"installations",
			"approve",
		);

		const results: Array<{
			id: string;
			ok: boolean;
			error?: string;
		}> = [];
		const notifiedEmployees = new Set<string>();

		for (const id of input.ids) {
			try {
				const pendingWhere = {
					id,
					organizationId: input.organizationId,
					status: "PENDING" as const,
					employee: getDealerScopeFilter(activeDealerId),
				};
				const target = await db.installation.findFirst({
					where: pendingWhere,
					select: {
						isAddOn: true,
						notes: true,
						price: true,
						stockItemId: true,
						setupRequest: { select: { status: true } },
						customer: {
							select: {
								externalId: true,
								firstName: true,
								lastName: true,
							},
						},
					},
				});
				if (!target) {
					throw new ORPCError("NOT_FOUND", {
						message: "Installation not found or not pending",
					});
				}
				// A pending setup request approves its lines together and logs
				// their money once as NEW_USER_SETUP. Approving one here first
				// would take the worker's stock even if the customer is then
				// rejected. Lines of an already-approved request (put back to
				// pending when its cash entry was deleted) approve normally.
				if (target.setupRequest?.status === "PENDING") {
					throw new ORPCError("CONFLICT", {
						message:
							"Part of a pending new-customer setup — approve or reject it from New Customers",
					});
				}
				// An add-on line sets the customer's IPTV / Real IP price, which
				// is iRadius-mirrored: push it remote-first, approve locally only
				// once iRadius accepted it.
				await mirrorToIRadius({
					iradiusDisabled,
					logTag: "[Installation Approve] iRadius add-on price",
					failureMessage:
						"Failed to update the customer in iRadius (add-on price / AP electrical) — not approved",
					remote: async () => {
						await pushAddonPricesToIRadius(target.customer, [
							target,
						]);
						await pushApElectricalToIRadius(target.customer, [
							target,
						]);
					},
					local: () =>
						db.$transaction(async (tx) => {
							const installation =
								await tx.installation.findFirst({
									where: pendingWhere,
								});
							if (!installation) {
								throw new ORPCError("NOT_FOUND", {
									message:
										"Installation not found or not pending",
								});
							}
							await approveInstallationInTx(
								tx,
								installation,
								user.id,
								{ createCashEntry: true },
							);
							notifiedEmployees.add(installation.employeeId);
						}),
				});
				results.push({ id, ok: true });
			} catch (error) {
				results.push({
					id,
					ok: false,
					error:
						error instanceof Error
							? error.message
							: "Approval failed",
				});
			}
		}

		for (const employeeId of notifiedEmployees) {
			notifyFieldEmployee({
				organizationId: input.organizationId,
				employeeId,
				title: bilingual(
					"Installation approved",
					"تمت الموافقة على التركيب",
				),
				message: bilingual(
					"Your installation submission was approved",
					"تمت الموافقة على التركيب الذي أرسلته",
				),
				type: "success",
				telegramText: tgMessage({
					icon: "✅",
					title: bilingual(
						"Installation approved",
						"تمت الموافقة على التركيب",
					),
					fields: [
						{
							icon: "🔧",
							value: bilingual(
								"Your submission was approved",
								"تمت الموافقة على ما أرسلته",
							),
						},
					],
				}),
			}).catch((err: unknown) =>
				logger.warn("[Installation Approve] notify failed", {
					error: String(err),
				}),
			);
		}

		return { results };
	});

export const denyInstallation = protectedProcedure
	.route({
		method: "POST",
		path: "/installations/{id}/deny",
		tags: ["Installations"],
		summary: "Deny a pending installation (no stock movement)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			reason: z.string().max(500).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"installations",
			"approve",
		);

		const installation = await db.installation.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				status: "PENDING",
				employee: getDealerScopeFilter(activeDealerId),
			},
			select: { id: true, employeeId: true, notes: true },
		});
		if (!installation) {
			throw new ORPCError("NOT_FOUND", {
				message: "Installation not found or not pending",
			});
		}

		const updated = await db.installation.update({
			where: { id: installation.id },
			data: {
				status: "DENIED",
				approvedById: user.id,
				approvedAt: new Date(),
				...(input.reason
					? {
							notes: installation.notes
								? `${installation.notes} — Denied: ${input.reason}`
								: `Denied: ${input.reason}`,
						}
					: {}),
			},
		});

		notifyFieldEmployee({
			organizationId: input.organizationId,
			employeeId: installation.employeeId,
			title: bilingual("Installation denied", "تم رفض التركيب"),
			message: input.reason
				? `${bilingual("An installation was denied", "تم رفض تركيب")}: ${input.reason}`
				: bilingual(
						"An installation submission was denied",
						"تم رفض تركيب أرسلته",
					),
			type: "warning",
			telegramText: tgMessage({
				icon: "⛔",
				title: bilingual("Installation denied", "تم رفض التركيب"),
				fields: [
					input.reason
						? {
								icon: "✍️",
								label: bilingual("Reason", "السبب"),
								value: input.reason,
							}
						: {
								icon: "🔧",
								value: bilingual(
									"Your submission was denied",
									"تم رفض ما أرسلته",
								),
							},
				],
			}),
		}).catch((err: unknown) =>
			logger.warn("[Installation Deny] notify failed", {
				error: String(err),
			}),
		);

		return { installation: updated };
	});
