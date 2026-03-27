import type { Prisma } from "@repo/database";
import { db, queryBilling, withBillingConnection } from "@repo/database";
import { logger } from "@repo/logs";
import { type Job, Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import { BILLING_SYNC_QUEUE_NAME } from "../queues/billing-sync.queue";
import type { BillingSyncJobData, BillingSyncJobResult } from "../types";

const BATCH_SIZE = 500;
const MAX_ERRORS = 50;

/** MySQL returns decimal columns as strings — parse to float safely. */
function toFloat(value: unknown): number {
	if (value == null) {
		return 0;
	}
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

// ─── Progress helper ────────────────────────────────────────────

async function updateProgress(
	operationId: string,
	data: Prisma.BillingSyncOperationUpdateInput,
) {
	await db.billingSyncOperation.update({
		where: { id: operationId },
		data,
	});
}

// ─── Main sync processor ────────────────────────────────────────

async function processBillingSync(
	job: Job<BillingSyncJobData>,
): Promise<BillingSyncJobResult> {
	const { operationId, organizationId, createEmployees, mapEmployees } =
		job.data;

	const result = {
		customers: { created: 0, updated: 0, skipped: 0, errors: 0 },
		payments: { created: 0, updated: 0, skipped: 0, errors: 0 },
		collections: { created: 0, updated: 0, skipped: 0, errors: 0 },
		expenses: { created: 0, updated: 0, skipped: 0, errors: 0 },
		stockItems: { created: 0, updated: 0, skipped: 0, errors: 0 },
		workerStock: { created: 0, updated: 0, skipped: 0, errors: 0 },
		installations: { created: 0, updated: 0, skipped: 0, errors: 0 },
		errors: [] as Array<{ phase: string; detail: string }>,
	};

	function addError(phase: string, detail: string) {
		if (result.errors.length < MAX_ERRORS) {
			result.errors.push({ phase, detail });
		}
	}

	try {
		await updateProgress(operationId, {
			status: "in_progress",
			startedAt: new Date(),
		});

		await withBillingConnection(async (conn) => {
			// ── Phase 0: Create admin-confirmed employees ────────────
			// The preview step identified unmatched billing employees.
			// The admin confirmed which ones to create before starting sync.

			if (createEmployees.length > 0) {
				const lastEmp = await db.employee.findFirst({
					where: { organizationId },
					orderBy: { employeeNumber: "desc" },
					select: { employeeNumber: true },
				});
				let nextEmpNum = 1;
				if (lastEmp) {
					const match = lastEmp.employeeNumber.match(/EMP-(\d+)/);
					if (match?.[1]) {
						nextEmpNum = Number.parseInt(match[1], 10) + 1;
					}
				}

				const ROLE_DEPT: Record<string, "BILLING" | "FIELD_OPS"> = {
					collector: "BILLING",
					worker: "FIELD_OPS",
				};
				const ROLE_POS: Record<string, string> = {
					collector: "Collector",
					worker: "Field Technician",
				};

				for (const emp of createEmployees) {
					try {
						const empNumber = `EMP-${String(nextEmpNum).padStart(5, "0")}`;
						nextEmpNum++;

						await db.employee.create({
							data: {
								organizationId,
								employeeNumber: empNumber,
								name: emp.username,
								username: emp.username,
								phone: emp.phone,
								department: ROLE_DEPT[emp.role] ?? "FIELD_OPS",
								position:
									ROLE_POS[emp.role] ?? "Field Technician",
								status: "ACTIVE",
							},
						});
					} catch (err) {
						addError(
							"employees",
							`Failed to create ${emp.username}: ${err instanceof Error ? err.message : String(err)}`,
						);
					}
				}
			}

			// ── Build lookup maps ─────────────────────────────────��──

			const employees = await db.employee.findMany({
				where: { organizationId },
				select: { id: true, name: true, username: true },
			});
			const employeeNameMap = new Map<string, string>();
			for (const emp of employees) {
				employeeNameMap.set(emp.name.toLowerCase(), emp.id);
				if (emp.username) {
					employeeNameMap.set(emp.username.toLowerCase(), emp.id);
				}
			}

			// Apply admin-confirmed mappings (billing username → existing employee)
			for (const mapping of mapEmployees) {
				employeeNameMap.set(
					mapping.billingUsername.toLowerCase(),
					mapping.employeeId,
				);
			}

			const customers = await db.customer.findMany({
				where: { organizationId, username: { not: null } },
				select: { id: true, username: true },
			});
			const customerUsernameMap = new Map<string, string>();
			for (const cust of customers) {
				if (cust.username) {
					customerUsernameMap.set(
						cust.username.toLowerCase(),
						cust.id,
					);
				}
			}

			function findEmployeeId(
				name: string | null | undefined,
			): string | null {
				if (!name) {
					return null;
				}
				return employeeNameMap.get(name.toLowerCase()) ?? null;
			}

			function findCustomerId(
				username: string | null | undefined,
			): string | null {
				if (!username) {
					return null;
				}
				return customerUsernameMap.get(username.toLowerCase()) ?? null;
			}

			// ── Phase 1: Customer Enrichment ─────────────────────────

			await updateProgress(operationId, { phase: "customers" });

			const johnRows = await queryBilling(
				conn,
				"SELECT id, username, name, `group`, account_price, discount, iptv_price, realip_price, collector, paid_account FROM john",
			);

			await updateProgress(operationId, {
				totalCustomers: johnRows.length,
			});

			let processedCustomers = 0;
			for (const row of johnRows) {
				try {
					const username = row["username"] as string | null;
					const customerId = findCustomerId(username);
					if (!customerId) {
						result.customers.skipped++;
						processedCustomers++;
						continue;
					}

					const collectorName = row["collector"] as string | null;
					const collectorId = findEmployeeId(collectorName);

					const accountPrice = toFloat(row["account_price"]);

					await db.customer.update({
						where: { id: customerId },
						data: {
							...(collectorId ? { collectorId } : {}),
							...(collectorName ? { collectorName } : {}),
							...(accountPrice > 0
								? { monthlyRate: accountPrice }
								: {}),
							discount: toFloat(row["discount"]),
							iptvPrice: toFloat(row["iptv_price"]),
							realIpPrice: toFloat(row["realip_price"]),
							...(row["group"]
								? { groupName: row["group"] as string }
								: {}),
							paidCurrentCycle: Number(row["paid_account"]) === 1,
						},
					});

					result.customers.updated++;
				} catch (err) {
					result.customers.errors++;
					addError(
						"customers",
						`username=${row["username"]}: ${err instanceof Error ? err.message : String(err)}`,
					);
				}

				processedCustomers++;
				if (processedCustomers % 100 === 0) {
					await updateProgress(operationId, { processedCustomers });
				}
			}
			await updateProgress(operationId, { processedCustomers });

			// ── Phase 2: Payments ────────────────────────────────────

			await updateProgress(operationId, { phase: "payments" });

			const paymentRows = await queryBilling(
				conn,
				"SELECT invoice_number, username, collector, account_price, paid_amount, discount, free_account, stopped_account, `timestamp`, note, processed FROM john_payment ORDER BY `timestamp` ASC",
			);

			await updateProgress(operationId, {
				totalPayments: paymentRows.length,
			});

			const billingCycleMap = new Map<string, string>();
			async function getOrCreateCycleId(date: Date): Promise<string> {
				const year = date.getFullYear();
				const month = date.getMonth() + 1;
				const key = `${year}-${month}`;

				const cached = billingCycleMap.get(key);
				if (cached) {
					return cached;
				}

				const cycle = await db.billingCycle.upsert({
					where: {
						organizationId_year_month: {
							organizationId,
							year,
							month,
						},
					},
					update: {},
					create: { organizationId, year, month, status: "CLOSED" },
				});
				billingCycleMap.set(key, cycle.id);
				return cycle.id;
			}

			let processedPayments = 0;
			const paymentBatch: Prisma.PaymentCreateManyInput[] = [];

			for (const row of paymentRows) {
				try {
					const username = row["username"] as string | null;
					const customerId = findCustomerId(username);
					if (!customerId) {
						result.payments.skipped++;
						processedPayments++;
						continue;
					}

					const collectorId = findEmployeeId(
						row["collector"] as string | null,
					);
					if (!collectorId) {
						result.payments.skipped++;
						processedPayments++;
						continue;
					}

					const timestamp = row["timestamp"] as Date | string | null;
					const paidAt = timestamp
						? new Date(String(timestamp))
						: new Date();
					const cycleId = await getOrCreateCycleId(paidAt);

					const stopped = Number(row["stopped_account"]) === 1;
					const processed = Number(row["processed"]) === 1;
					let status: "PENDING" | "PROCESSED" | "STOPPED" = "PENDING";
					if (stopped) {
						status = "STOPPED";
					} else if (processed) {
						status = "PROCESSED";
					}

					const invoiceNum = row["invoice_number"];
					const note = row["note"] as string | null;
					const notes = invoiceNum
						? `Invoice #${invoiceNum}${note ? ` — ${note}` : ""}`
						: note;

					paymentBatch.push({
						organizationId,
						customerId,
						billingCycleId: cycleId,
						collectorId,
						accountPrice: toFloat(row["account_price"]),
						paidAmount: toFloat(row["paid_amount"]),
						discount: toFloat(row["discount"]),
						status,
						freeAccount: Number(row["free_account"]) === 1,
						stoppedAccount: stopped,
						notes: notes ?? null,
						paidAt,
						processedAt: status === "PROCESSED" ? paidAt : null,
					});

					result.payments.created++;
				} catch (err) {
					result.payments.errors++;
					addError(
						"payments",
						`invoice=${row["invoice_number"]}: ${err instanceof Error ? err.message : String(err)}`,
					);
				}

				processedPayments++;

				if (paymentBatch.length >= BATCH_SIZE) {
					await db.payment.createMany({
						data: paymentBatch,
						skipDuplicates: true,
					});
					paymentBatch.length = 0;
					await updateProgress(operationId, { processedPayments });
				}
			}

			if (paymentBatch.length > 0) {
				await db.payment.createMany({
					data: paymentBatch,
					skipDuplicates: true,
				});
			}
			await updateProgress(operationId, { processedPayments });

			// ── Phase 3: Cash Collections ────────────────────────────

			await updateProgress(operationId, { phase: "collections" });

			const collectionRows = await queryBilling(
				conn,
				"SELECT id, collector, collect_amount, date, note FROM john_collection ORDER BY date ASC",
			);

			await updateProgress(operationId, {
				totalCollections: collectionRows.length,
			});

			let processedCollections = 0;
			const collectionBatch: Prisma.CashCollectionCreateManyInput[] = [];

			for (const row of collectionRows) {
				try {
					const collectorId = findEmployeeId(
						row["collector"] as string | null,
					);
					if (!collectorId) {
						result.collections.skipped++;
						processedCollections++;
						continue;
					}

					const date = row["date"] as Date | string | null;

					collectionBatch.push({
						organizationId,
						collectorId,
						amount: toFloat(row["collect_amount"]),
						notes: (row["note"] as string) ?? null,
						type: "HANDOFF",
						collectedAt: date ? new Date(String(date)) : new Date(),
					});

					result.collections.created++;
				} catch (err) {
					result.collections.errors++;
					addError(
						"collections",
						`id=${row["id"]}: ${err instanceof Error ? err.message : String(err)}`,
					);
				}

				processedCollections++;
				if (collectionBatch.length >= BATCH_SIZE) {
					await db.cashCollection.createMany({
						data: collectionBatch,
					});
					collectionBatch.length = 0;
					await updateProgress(operationId, { processedCollections });
				}
			}

			if (collectionBatch.length > 0) {
				await db.cashCollection.createMany({ data: collectionBatch });
			}
			await updateProgress(operationId, { processedCollections });

			// ── Phase 4: Expenses ────────────────────────────────────

			await updateProgress(operationId, { phase: "expenses" });

			const expenseRows = await queryBilling(
				conn,
				"SELECT id, amount, worker_username, image_name, note, `timestamp`, approved FROM expenses ORDER BY `timestamp` ASC",
			);

			await updateProgress(operationId, {
				totalExpenses: expenseRows.length,
			});

			let processedExpenses = 0;
			for (const row of expenseRows) {
				try {
					const workerName = row["worker_username"] as string | null;
					const employeeId = findEmployeeId(workerName);
					if (!employeeId) {
						result.expenses.skipped++;
						processedExpenses++;
						continue;
					}

					const ts = row["timestamp"] as Date | string | null;
					const approved = Number(row["approved"]) === 1;

					await db.expense.create({
						data: {
							organizationId,
							submittedById: employeeId,
							amount: toFloat(row["amount"]),
							description:
								(row["note"] as string) ?? "Imported expense",
							receiptUrl: (row["image_name"] as string) ?? null,
							status: approved ? "APPROVED" : "PENDING",
							approvedAt:
								approved && ts ? new Date(String(ts)) : null,
							createdAt: ts ? new Date(String(ts)) : new Date(),
						},
					});

					result.expenses.created++;
				} catch (err) {
					result.expenses.errors++;
					addError(
						"expenses",
						`id=${row["id"]}: ${err instanceof Error ? err.message : String(err)}`,
					);
				}

				processedExpenses++;
				if (processedExpenses % 100 === 0) {
					await updateProgress(operationId, { processedExpenses });
				}
			}
			await updateProgress(operationId, { processedExpenses });

			// ── Phase 5: Stock Items ─────────────────────────────────

			await updateProgress(operationId, { phase: "stockItems" });

			const stockRows = await queryBilling(
				conn,
				"SELECT id, item_name, quantity, price, sellPrice, alert_on, alert_enabled FROM admin_stock",
			);

			await updateProgress(operationId, {
				totalStockItems: stockRows.length,
			});

			const stockItemMap = new Map<string, string>();

			let processedStockItems = 0;
			for (const row of stockRows) {
				try {
					const name = (row["item_name"] as string)?.trim();
					if (!name) {
						result.stockItems.skipped++;
						processedStockItems++;
						continue;
					}

					const item = await db.stockItem.upsert({
						where: {
							organizationId_name: { organizationId, name },
						},
						update: {
							quantity: toFloat(row["quantity"]),
							costPrice: toFloat(row["price"]),
							sellPrice: toFloat(row["sellPrice"]),
							alertThreshold: toFloat(row["alert_on"]) || null,
							alertEnabled: Number(row["alert_enabled"]) === 1,
						},
						create: {
							organizationId,
							name,
							quantity: toFloat(row["quantity"]),
							costPrice: toFloat(row["price"]),
							sellPrice: toFloat(row["sellPrice"]),
							alertThreshold: toFloat(row["alert_on"]) || null,
							alertEnabled: Number(row["alert_enabled"]) === 1,
						},
					});

					stockItemMap.set(name.toLowerCase(), item.id);
					result.stockItems.updated++;
				} catch (err) {
					result.stockItems.errors++;
					addError(
						"stockItems",
						`name=${row["item_name"]}: ${err instanceof Error ? err.message : String(err)}`,
					);
				}

				processedStockItems++;
			}
			await updateProgress(operationId, { processedStockItems });

			// ── Phase 6: Worker Stock ────────────────────────────────

			await updateProgress(operationId, { phase: "workerStock" });

			const workerStockRows = await queryBilling(
				conn,
				"SELECT id, item_name, quantity, unitprice, assigned_to FROM worker_stock",
			);

			await updateProgress(operationId, {
				totalWorkerStock: workerStockRows.length,
			});

			let processedWorkerStock = 0;
			for (const row of workerStockRows) {
				try {
					const itemName = (row["item_name"] as string)
						?.trim()
						?.toLowerCase();
					const stockItemId = itemName
						? stockItemMap.get(itemName)
						: undefined;
					if (!stockItemId) {
						result.workerStock.skipped++;
						processedWorkerStock++;
						continue;
					}

					const workerName = row["assigned_to"] as string | null;
					const employeeId = findEmployeeId(workerName);
					if (!employeeId) {
						result.workerStock.skipped++;
						processedWorkerStock++;
						continue;
					}

					await db.workerStock.upsert({
						where: {
							stockItemId_employeeId: { stockItemId, employeeId },
						},
						update: {
							quantity: toFloat(row["quantity"]),
							unitPrice: toFloat(row["unitprice"]),
						},
						create: {
							stockItemId,
							employeeId,
							quantity: toFloat(row["quantity"]),
							unitPrice: toFloat(row["unitprice"]),
						},
					});

					result.workerStock.updated++;
				} catch (err) {
					result.workerStock.errors++;
					addError(
						"workerStock",
						`id=${row["id"]}: ${err instanceof Error ? err.message : String(err)}`,
					);
				}

				processedWorkerStock++;
			}
			await updateProgress(operationId, { processedWorkerStock });

			// ── Phase 7: Installations ───────────────────────────────

			await updateProgress(operationId, { phase: "installations" });

			const installRows = await queryBilling(
				conn,
				"SELECT id, worker_username, item_name, customer_name, customer_username, quantity, price, installation_date, state, isAddOn FROM installations ORDER BY installation_date ASC",
			);

			await updateProgress(operationId, {
				totalInstallations: installRows.length,
			});

			let processedInstallations = 0;
			const installBatch: Prisma.InstallationCreateManyInput[] = [];

			for (const row of installRows) {
				try {
					const customerId = findCustomerId(
						row["customer_username"] as string | null,
					);
					const employeeId = findEmployeeId(
						row["worker_username"] as string | null,
					);

					if (!customerId || !employeeId) {
						result.installations.skipped++;
						processedInstallations++;
						continue;
					}

					const itemName = (row["item_name"] as string)
						?.trim()
						?.toLowerCase();
					const stockItemId = itemName
						? (stockItemMap.get(itemName) ?? null)
						: null;

					const installDate = row["installation_date"] as
						| Date
						| string
						| null;
					const state = Number(row["state"]);

					installBatch.push({
						organizationId,
						customerId,
						employeeId,
						stockItemId,
						quantity: toFloat(row["quantity"]) || 1,
						price: toFloat(row["price"]),
						isAddOn: Number(row["isAddOn"]) === 1,
						status: state === 1 ? "APPROVED" : "PENDING",
						installedAt: installDate
							? new Date(String(installDate))
							: new Date(),
					});

					result.installations.created++;
				} catch (err) {
					result.installations.errors++;
					addError(
						"installations",
						`id=${row["id"]}: ${err instanceof Error ? err.message : String(err)}`,
					);
				}

				processedInstallations++;
				if (installBatch.length >= BATCH_SIZE) {
					await db.installation.createMany({ data: installBatch });
					installBatch.length = 0;
					await updateProgress(operationId, {
						processedInstallations,
					});
				}
			}

			if (installBatch.length > 0) {
				await db.installation.createMany({ data: installBatch });
			}
			await updateProgress(operationId, { processedInstallations });
		});

		// ── Complete ─────────────────────────────────────────────
		await updateProgress(operationId, {
			status: "completed",
			completedAt: new Date(),
			result,
		});

		logger.info("[Billing Sync] Completed", { operationId, result });
		return { success: true, operationId };
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		logger.error("[Billing Sync] Failed", { operationId, error: msg });

		await updateProgress(operationId, {
			status: "failed",
			completedAt: new Date(),
			result: { error: msg, ...result },
		}).catch(() => {});

		return { success: false, operationId };
	}
}

// ─── Worker factory ─────────────────────────────────────────────

export function createBillingSyncWorker(): Worker<
	BillingSyncJobData,
	BillingSyncJobResult
> {
	return new Worker<BillingSyncJobData, BillingSyncJobResult>(
		BILLING_SYNC_QUEUE_NAME,
		(job) => processBillingSync(job),
		{
			connection: getRedisConnection(),
			concurrency: 1,
		},
	);
}
