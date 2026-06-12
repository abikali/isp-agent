import type { Prisma } from "@repo/database";
import { db } from "@repo/database";
import { queryBilling, withBillingConnection } from "@repo/database/billing";
import { logger } from "@repo/logs";
import { type Job, Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import { BILLING_SYNC_QUEUE_NAME } from "../queues/billing-sync.queue";
import type { BillingSyncJobData, BillingSyncJobResult } from "../types";

// NOTE: We deliberately do NOT call `openBillingMonth` from this worker.
// `@repo/jobs` cannot import `@repo/api` (would create a dependency cycle),
// and these call-sites don't need invoice generation:
//   - getOrCreateMonthId (below) backfills historical months from PHP
//     payment history — those months are closed; generating invoices is wrong.
//   - The reconciliation step further down opens the current month, which
//     in practice has already been opened by `resolveActiveBillingMonth`
//     the first time a user loaded a billing page.

const BATCH_SIZE = 500;
/** Offset added to addon installation IDs to avoid collision with main installations */
const ADDON_ID_OFFSET = 1_000_000;
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
	const { operationId, organizationId, employeeMappings } = job.data;

	const result = {
		customers: { created: 0, updated: 0, skipped: 0, errors: 0 },
		payments: { created: 0, updated: 0, skipped: 0, errors: 0 },
		collections: { created: 0, updated: 0, skipped: 0, errors: 0 },
		expenses: { created: 0, updated: 0, skipped: 0, errors: 0 },
		stockItems: { created: 0, updated: 0, skipped: 0, errors: 0 },
		workerStock: { created: 0, updated: 0, skipped: 0, errors: 0 },
		installations: { created: 0, updated: 0, skipped: 0, errors: 0 },
		followups: { created: 0, updated: 0, skipped: 0, errors: 0 },
		tasks: { created: 0, updated: 0, skipped: 0, errors: 0 },
		uninstalledItems: { created: 0, updated: 0, skipped: 0, errors: 0 },
		stockLogs: { created: 0, updated: 0, skipped: 0, errors: 0 },
		stationWorkers: { created: 0, updated: 0, skipped: 0, errors: 0 },
		addonInstallations: { created: 0, updated: 0, skipped: 0, errors: 0 },
		reconciliation: { created: 0, updated: 0, skipped: 0, errors: 0 },
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
			// ── Phase 0c: Sync Telegram chat IDs from billing isplogin table
			try {
				const loginRows = await queryBilling(
					conn,
					"SELECT username, telegram FROM isplogin WHERE telegram IS NOT NULL AND telegram != '0'",
				);
				for (const row of loginRows) {
					const username = row["username"] as string | null;
					const telegram = row["telegram"] as string | null;
					if (!username || !telegram) {
						continue;
					}
					await db.employee
						.updateMany({
							where: {
								organizationId,
								username: {
									equals: username,
									mode: "insensitive",
								},
								telegramChatId: null,
							},
							data: { telegramChatId: telegram },
						})
						.catch((err) =>
							logger.warn(
								`[Billing Sync] Telegram update failed for ${username}`,
								{
									error:
										err instanceof Error
											? err.message
											: String(err),
								},
							),
						);
				}
			} catch (err) {
				addError(
					"employees",
					`Telegram sync: ${err instanceof Error ? err.message : String(err)}`,
				);
			}

			// ── Build lookup maps ────────────────────────────────────

			const org = await db.organization.findUnique({
				where: { id: organizationId },
				select: { activeDealerId: true },
			});

			const employees = await db.employee.findMany({
				where: { organizationId },
				select: { id: true, name: true, username: true, userId: true },
			});
			const employeeNameMap = new Map<string, string>();
			const employeeUserIdMap = new Map<string, string>();
			// Names to skip during lookup (user explicitly chose "skip" in mapping UI)
			const skippedEmployeeNames = new Set<string>();
			for (const emp of employees) {
				employeeNameMap.set(emp.name.toLowerCase(), emp.id);
				if (emp.username) {
					employeeNameMap.set(emp.username.toLowerCase(), emp.id);
				}
				if (emp.userId) {
					employeeUserIdMap.set(emp.id, emp.userId);
				}
			}

			// Apply employee mappings from the sync UI
			if (employeeMappings) {
				for (const [legacyName, mapping] of Object.entries(
					employeeMappings,
				)) {
					const key = legacyName.toLowerCase();
					if (mapping.action === "skip") {
						skippedEmployeeNames.add(key);
					} else if (
						mapping.action === "map" &&
						mapping.targetEmployeeId
					) {
						employeeNameMap.set(key, mapping.targetEmployeeId);
					} else if (mapping.action === "create") {
						// Map legacy role to department
						const departmentMap: Record<
							string,
							Prisma.EmployeeCreateInput["department"]
						> = {
							worker: "FIELD_OPS",
							collector: "BILLING",
							followup: "CUSTOMER_SERVICE",
							accounting: "MANAGEMENT",
						};
						const department =
							departmentMap[mapping.role ?? ""] ?? null;
						const position = mapping.role ?? null;

						const telegram =
							mapping.telegram &&
							mapping.telegram !== "0" &&
							mapping.telegram !== ""
								? mapping.telegram
								: null;

						// Create a new employee record under the active dealer
						const newEmployee = await db.employee.create({
							data: {
								organizationId,
								employeeNumber: legacyName,
								name: mapping.createName ?? legacyName,
								username: legacyName,
								dealerId: org?.activeDealerId ?? null,
								department,
								position,
								phone: mapping.phone ?? null,
								telegramChatId: telegram,
							},
						});
						employeeNameMap.set(key, newEmployee.id);
						logger.info(
							`[Billing Sync] Created employee for mapping: ${legacyName} → ${newEmployee.id}`,
						);
					}
				}
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
				const key = name.toLowerCase();
				if (skippedEmployeeNames.has(key)) {
					return null;
				}
				return employeeNameMap.get(key) ?? null;
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
				"SELECT id, username, name, `group`, account_price, discount, iptv_price, realip_price, paid_account FROM john",
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

					const accountPrice = toFloat(row["account_price"]);

					await db.customer.update({
						where: { id: customerId },
						data: {
							...(accountPrice > 0
								? { monthlyRate: accountPrice }
								: {}),
							discount: toFloat(row["discount"]),
							iptvPrice: toFloat(row["iptv_price"]),
							realIpPrice: toFloat(row["realip_price"]),
							...(row["group"]
								? { groupName: row["group"] as string }
								: {}),
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

			// ── Phase 1b: GPS coordinates from john_full + worker from john ──

			await updateProgress(operationId, { phase: "gps_enrichment" });

			const gpsRows = await queryBilling(
				conn,
				"SELECT username, lat, lng FROM john_full WHERE lat IS NOT NULL AND lat != 0 AND lng IS NOT NULL AND lng != 0",
			);

			let gpsUpdated = 0;
			for (const row of gpsRows) {
				const username = row["username"] as string | null;
				const customerId = findCustomerId(username);
				if (!customerId) {
					continue;
				}
				const lat = Number(row["lat"]);
				const lng = Number(row["lng"]);
				if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
					continue;
				}
				try {
					await db.customer.update({
						where: { id: customerId },
						data: { latitude: lat, longitude: lng },
					});
					gpsUpdated++;
				} catch {
					// Skip silently — non-critical
				}
			}
			logger.info(
				`[Billing Sync] GPS enrichment: ${gpsUpdated} customers updated`,
			);

			// Worker assignments from john
			const workerRows = await queryBilling(
				conn,
				"SELECT username, worker FROM john WHERE worker IS NOT NULL AND worker != ''",
			);

			let workersAssigned = 0;
			for (const row of workerRows) {
				const username = row["username"] as string | null;
				const customerId = findCustomerId(username);
				if (!customerId) {
					continue;
				}
				const workerName = row["worker"] as string | null;
				const workerId = findEmployeeId(workerName);
				if (!workerId) {
					continue;
				}
				try {
					await db.customer.update({
						where: { id: customerId },
						data: { workerId },
					});
					workersAssigned++;
				} catch {
					// Skip silently — non-critical
				}
			}
			logger.info(
				`[Billing Sync] Worker assignments: ${workersAssigned} customers updated`,
			);

			// ── Phase 2: Payments ────────────────────────────────────

			await updateProgress(operationId, { phase: "payments" });

			const paymentRows = await queryBilling(
				conn,
				"SELECT invoice_number, username, collector, worker, account_price, paid_amount, discount, free_account, stopped_account, `timestamp`, note, processed FROM john_payment ORDER BY `timestamp` ASC",
			);

			await updateProgress(operationId, {
				totalPayments: paymentRows.length,
			});

			const billingMonthMap = new Map<string, string>();
			async function getOrCreateMonthId(date: Date): Promise<string> {
				const year = date.getFullYear();
				const month = date.getMonth() + 1;
				const key = `${year}-${month}`;

				const cached = billingMonthMap.get(key);
				if (cached) {
					return cached;
				}

				const billingMonth = await db.billingMonth.upsert({
					where: {
						organizationId_year_month: {
							organizationId,
							year,
							month,
						},
					},
					update: {},
					create: { organizationId, year, month, locked: true },
				});
				billingMonthMap.set(key, billingMonth.id);
				return billingMonth.id;
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
					const monthId = await getOrCreateMonthId(paidAt);

					const stoppedAccount = Number(row["stopped_account"]) === 1;

					const invoiceNum = row["invoice_number"];
					const note = row["note"] as string | null;
					const notes = invoiceNum
						? `Invoice #${invoiceNum}${note ? ` — ${note}` : ""}`
						: note;

					const workerName = row["worker"] as string | null;
					const workerId = workerName?.trim()
						? findEmployeeId(workerName.trim())
						: null;

					paymentBatch.push({
						organizationId,
						customerId,
						billingMonthId: monthId,
						collectorId,
						externalBillingId: row["invoice_number"] as number,
						accountPrice: toFloat(row["account_price"]),
						paidAmount: toFloat(row["paid_amount"]),
						discount: toFloat(row["discount"]),
						freeAccount: Number(row["free_account"]) === 1,
						stoppedAccount,
						workerId: workerId ?? null,
						notes: notes ?? null,
						paidAt,
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

			// ── Phase 3: Cash Collections (full worker financial ledger) ─

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

					const billingId = row["id"] as number;
					const date = row["date"] as Date | string | null;
					const note = (row["note"] as string) ?? "";

					// Categorize entry by note pattern
					let type: Prisma.CashCollectionCreateManyInput["type"] =
						"OTHER";
					if (note === "wasil" || note.startsWith("wasil")) {
						type = "HANDOFF";
					} else if (note.includes("bought")) {
						type = "STOCK_RECEIVED";
					} else if (note.startsWith("Approved installation")) {
						type = "INSTALLATION_COST";
					} else if (note.startsWith("Dealer")) {
						type = "DEALER_PAYMENT";
					} else if (
						note.startsWith("Transfer From Admin") ||
						note.startsWith("Wish Transfer")
					) {
						type = "ADMIN_TRANSFER";
					} else if (note.includes("created the user")) {
						type = "NEW_USER_SETUP";
					}

					collectionBatch.push({
						organizationId,
						collectorId,
						amount: toFloat(row["collect_amount"]),
						notes: note || null,
						type,
						externalBillingId: billingId,
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
						skipDuplicates: true,
					});
					collectionBatch.length = 0;
					await updateProgress(operationId, { processedCollections });
				}
			}

			if (collectionBatch.length > 0) {
				await db.cashCollection.createMany({
					data: collectionBatch,
					skipDuplicates: true,
				});
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

					const billingId = row["id"] as number;
					const ts = row["timestamp"] as Date | string | null;
					const approved = Number(row["approved"]) === 1;

					await db.expense.upsert({
						where: {
							organizationId_externalBillingId: {
								organizationId,
								externalBillingId: billingId,
							},
						},
						update: {
							amount: toFloat(row["amount"]),
							description:
								(row["note"] as string) ?? "Imported expense",
							receiptUrl: (row["image_name"] as string) ?? null,
							status: approved ? "APPROVED" : "PENDING",
							approvedAt:
								approved && ts ? new Date(String(ts)) : null,
						},
						create: {
							organizationId,
							submittedById: employeeId,
							externalBillingId: billingId,
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

			// Cutover guard: once native stock operations exist (StockLog
			// rows created by the app, not the import), local quantities are
			// the source of truth — never overwrite them from the legacy DB.
			// New items are still created and prices/alerts still refresh.
			const hasNativeStockOps =
				(await db.stockLog.count({
					where: { organizationId, externalBillingId: null },
				})) > 0;
			if (hasNativeStockOps) {
				logger.info(
					"[Billing Sync] Native stock activity detected — skipping quantity overwrites",
					{ organizationId },
				);
			}

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
							...(hasNativeStockOps
								? {}
								: { quantity: toFloat(row["quantity"]) }),
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
							...(hasNativeStockOps
								? {}
								: { quantity: toFloat(row["quantity"]) }),
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
						externalBillingId: row["id"] as number,
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
					await db.installation.createMany({
						data: installBatch,
						skipDuplicates: true,
					});
					installBatch.length = 0;
					await updateProgress(operationId, {
						processedInstallations,
					});
				}
			}

			if (installBatch.length > 0) {
				await db.installation.createMany({
					data: installBatch,
					skipDuplicates: true,
				});
			}
			await updateProgress(operationId, { processedInstallations });

			// ── Phase 8: Followups ──────────────────────────────────

			await updateProgress(operationId, { phase: "followups" });

			const followupRows = await queryBilling(
				conn,
				"SELECT id, name, username, mobile, is_done, note, status, collector_note, date_time, is_done_date_time, `group` FROM followup ORDER BY date_time ASC",
			);

			for (const row of followupRows) {
				try {
					const billingId = row["id"] as number;
					const username = row["username"] as string | null;
					const customerId = findCustomerId(username);
					const isDone = row["is_done"] === "yes";
					const dt = row["date_time"] as Date | string | null;
					const doneDt = row["is_done_date_time"] as
						| Date
						| string
						| null;

					await db.followup.upsert({
						where: {
							organizationId_externalBillingId: {
								organizationId,
								externalBillingId: billingId,
							},
						},
						update: {
							isDone,
							note: (row["note"] as string) ?? null,
							status: (row["status"] as string) ?? null,
							collectorNote:
								(row["collector_note"] as string) ?? null,
							doneAt:
								isDone && doneDt
									? new Date(String(doneDt))
									: null,
						},
						create: {
							organizationId,
							externalBillingId: billingId,
							customerId: customerId ?? null,
							customerName: (row["name"] as string) ?? null,
							customerUsername: username ?? null,
							mobile: (row["mobile"] as string) ?? null,
							groupName: (row["group"] as string) ?? null,
							isDone,
							note: (row["note"] as string) ?? null,
							status: (row["status"] as string) ?? null,
							collectorNote:
								(row["collector_note"] as string) ?? null,
							doneAt:
								isDone && doneDt
									? new Date(String(doneDt))
									: null,
							createdAt: dt ? new Date(String(dt)) : new Date(),
						},
					});

					result.followups.created++;
				} catch (err) {
					result.followups.errors++;
					addError(
						"followups",
						`id=${row["id"]}: ${err instanceof Error ? err.message : String(err)}`,
					);
				}
			}

			// ── Phase 9: Legacy Tasks (uninstall/maintenance) ───────

			await updateProgress(operationId, { phase: "legacy_tasks" });

			const taskRows = await queryBilling(
				conn,
				"SELECT t.id, t.type, t.message, t.status, t.customer_username, t.task_date, t.wid FROM tasks t ORDER BY t.task_date ASC",
			);

			// Build a map of task legacy ID → our task ID for uninstalled items later
			const taskIdMap = new Map<number, string>();

			for (const row of taskRows) {
				try {
					const billingId = row["id"] as number;
					const taskType = row["type"] as string;
					const customerId = findCustomerId(
						row["customer_username"] as string | null,
					);
					const taskDate = row["task_date"] as Date | string | null;
					const legacyStatus = row["status"] as string;

					let status:
						| "OPEN"
						| "IN_PROGRESS"
						| "COMPLETED"
						| "CANCELLED" = "OPEN";
					if (
						legacyStatus === "completed" ||
						legacyStatus === "approved"
					) {
						status = "COMPLETED";
					} else if (legacyStatus === "denied") {
						status = "CANCELLED";
					} else if (legacyStatus === "assigned") {
						status = "IN_PROGRESS";
					}

					const category =
						taskType === "maintenance"
							? "MAINTENANCE"
							: "INSTALLATION";

					const task = await db.task.upsert({
						where: {
							organizationId_externalBillingId: {
								organizationId,
								externalBillingId: billingId,
							},
						},
						update: {
							status,
							completedAt:
								status === "COMPLETED" && taskDate
									? new Date(String(taskDate))
									: null,
						},
						create: {
							organizationId,
							externalBillingId: billingId,
							title: `${taskType === "maintenance" ? "Maintenance" : "Uninstall"} #${billingId}`,
							description: (row["message"] as string) ?? null,
							category,
							source: "MANUAL",
							status,
							customerId: customerId ?? null,
							completedAt:
								status === "COMPLETED" && taskDate
									? new Date(String(taskDate))
									: null,
							createdAt: taskDate
								? new Date(String(taskDate))
								: new Date(),
						},
					});

					taskIdMap.set(billingId, task.id);

					// Sync task assignments
					const wid = row["wid"] as string | null;
					if (wid) {
						const workerIds = wid
							.split(",")
							.map((w) => findEmployeeId(w.trim()))
							.filter(Boolean) as string[];
						for (const empId of workerIds) {
							await db.taskAssignment
								.upsert({
									where: {
										taskId_employeeId: {
											taskId: task.id,
											employeeId: empId,
										},
									},
									update: {},
									create: {
										taskId: task.id,
										employeeId: empId,
									},
								})
								.catch(() => {});
						}
					}

					result.tasks.created++;
				} catch (err) {
					result.tasks.errors++;
					addError(
						"tasks",
						`id=${row["id"]}: ${err instanceof Error ? err.message : String(err)}`,
					);
				}
			}

			// ── Phase 10: Uninstalled Items ─────────────────────────

			await updateProgress(operationId, { phase: "uninstalled_items" });

			const uninstallRows = await queryBilling(
				conn,
				"SELECT id, task_id, item_name, quantity, picture_url, worker_id, item_status, uninstall_time FROM uninstalled_items ORDER BY uninstall_time ASC",
			);

			for (const row of uninstallRows) {
				try {
					const billingId = row["id"] as number;
					const legacyTaskId = row["task_id"] as number;
					const taskId = taskIdMap.get(legacyTaskId) ?? null;

					const itemStatus = row["item_status"] as string;
					let status: "PENDING" | "APPROVED" = "PENDING";
					if (itemStatus === "approved") {
						status = "APPROVED";
					}

					const ts = row["uninstall_time"] as Date | string | null;

					await db.uninstalledItem.upsert({
						where: {
							organizationId_externalBillingId: {
								organizationId,
								externalBillingId: billingId,
							},
						},
						update: {
							status,
							itemName: (row["item_name"] as string) ?? "Unknown",
							quantity: toFloat(row["quantity"]) || 1,
							pictureUrl: (row["picture_url"] as string) ?? null,
						},
						create: {
							organizationId,
							externalBillingId: billingId,
							taskId,
							itemName: (row["item_name"] as string) ?? "Unknown",
							quantity: toFloat(row["quantity"]) || 1,
							pictureUrl: (row["picture_url"] as string) ?? null,
							status,
							uninstalledAt: ts
								? new Date(String(ts))
								: new Date(),
						},
					});

					result.uninstalledItems.created++;
				} catch (err) {
					result.uninstalledItems.errors++;
					addError(
						"uninstalledItems",
						`id=${row["id"]}: ${err instanceof Error ? err.message : String(err)}`,
					);
				}
			}

			// ── Phase 11: Stock Log ─────────────────────────────────

			await updateProgress(operationId, { phase: "stock_logs" });

			const stockLogRows = await queryBilling(
				conn,
				"SELECT id, username, action, item_name, `timestamp`, worker_username, quantity, admin_previous_quantity, admin_new_quantity, worker_previous_quantity, worker_new_quantity FROM stock_log ORDER BY `timestamp` ASC",
			);

			for (const row of stockLogRows) {
				try {
					const itemName = (row["item_name"] as string)
						?.trim()
						?.toLowerCase();
					const stockItemId = itemName
						? stockItemMap.get(itemName)
						: undefined;
					if (!stockItemId) {
						result.stockLogs.skipped++;
						continue;
					}

					const adminUser = row["username"] as string | null;
					const performedById = findEmployeeId(adminUser);
					const workerName = row["worker_username"] as string | null;
					const employeeId = findEmployeeId(workerName);

					if (!performedById) {
						result.stockLogs.skipped++;
						continue;
					}

					const legacyAction = row["action"] as string;
					let action: "ADD" | "DELIVER" | "TRANSFER_TO_WORKER" =
						"DELIVER";
					if (legacyAction === "add quantity") {
						action = "ADD";
					} else if (legacyAction === "deliver") {
						action = "DELIVER";
					}

					const ts = row["timestamp"] as Date | string | null;

					// StockLog requires performedById to be a User ID, not Employee ID.
					const performerUserId =
						employeeUserIdMap.get(performedById);
					if (!performerUserId) {
						result.stockLogs.skipped++;
						continue;
					}

					const billingId = row["id"] as number;
					await db.stockLog.upsert({
						where: {
							organizationId_externalBillingId: {
								organizationId,
								externalBillingId: billingId,
							},
						},
						update: {
							quantity: toFloat(row["quantity"]) || 0,
						},
						create: {
							organizationId,
							externalBillingId: billingId,
							stockItemId,
							employeeId: employeeId ?? null,
							performedById: performerUserId,
							action,
							itemName: (row["item_name"] as string) ?? "Unknown",
							quantity: toFloat(row["quantity"]) || 0,
							adminQtyBefore:
								toFloat(row["admin_previous_quantity"]) || null,
							adminQtyAfter:
								toFloat(row["admin_new_quantity"]) || null,
							workerQtyBefore:
								toFloat(row["worker_previous_quantity"]) ||
								null,
							workerQtyAfter:
								toFloat(row["worker_new_quantity"]) || null,
							createdAt: ts ? new Date(String(ts)) : new Date(),
						},
					});

					result.stockLogs.created++;
				} catch (err) {
					result.stockLogs.errors++;
					addError(
						"stockLogs",
						`id=${row["id"]}: ${err instanceof Error ? err.message : String(err)}`,
					);
				}
			}

			// ── Phase 12: Station-Worker Assignments ────────────────

			await updateProgress(operationId, { phase: "station_workers" });

			const stationWorkerRows = await queryBilling(
				conn,
				"SELECT sw.station_id, sw.worker_username, s.station_name FROM station_workers sw LEFT JOIN stations s ON sw.station_id = s.id",
			);

			// Build station name → our station ID map
			const stations = await db.station.findMany({
				where: { organizationId },
				select: { id: true, name: true },
			});
			const stationNameMap = new Map<string, string>();
			for (const st of stations) {
				stationNameMap.set(st.name.toLowerCase(), st.id);
			}

			for (const row of stationWorkerRows) {
				try {
					const stationName = row["station_name"] as string | null;
					const stationId = stationName
						? stationNameMap.get(stationName.toLowerCase())
						: undefined;
					if (!stationId) {
						result.stationWorkers.skipped++;
						continue;
					}

					const workerName = row["worker_username"] as string | null;
					const employeeId = findEmployeeId(workerName);
					if (!employeeId) {
						result.stationWorkers.skipped++;
						continue;
					}

					await db.employeeStation
						.upsert({
							where: {
								employeeId_stationId: {
									employeeId,
									stationId,
								},
							},
							update: {},
							create: { employeeId, stationId },
						})
						.catch(() => {});

					result.stationWorkers.created++;
				} catch (err) {
					result.stationWorkers.errors++;
					addError(
						"stationWorkers",
						`station=${row["station_name"]}: ${err instanceof Error ? err.message : String(err)}`,
					);
				}
			}

			// ── Phase 13: Add-on Installations ──────────────────────

			await updateProgress(operationId, { phase: "addon_installations" });

			const addonRows = await queryBilling(
				conn,
				"SELECT id, worker_username, addon_name, customer_name, customer_username, price, installation_date, state FROM installations_addons ORDER BY installation_date ASC",
			);

			for (const row of addonRows) {
				try {
					const customerId = findCustomerId(
						row["customer_username"] as string | null,
					);
					const employeeId = findEmployeeId(
						row["worker_username"] as string | null,
					);

					if (!customerId || !employeeId) {
						result.addonInstallations.skipped++;
						continue;
					}

					const billingId = row["id"] as number;
					const installDate = row["installation_date"] as
						| Date
						| string
						| null;
					const state = Number(row["state"]);

					await db.installation.upsert({
						where: {
							organizationId_externalBillingId: {
								organizationId,
								externalBillingId: billingId + ADDON_ID_OFFSET,
							},
						},
						update: {
							status: state === 1 ? "APPROVED" : "PENDING",
						},
						create: {
							organizationId,
							customerId,
							employeeId,
							externalBillingId: billingId + ADDON_ID_OFFSET,
							quantity: 1,
							price: toFloat(row["price"]),
							isAddOn: true,
							status: state === 1 ? "APPROVED" : "PENDING",
							notes: (row["addon_name"] as string) ?? null,
							installedAt: installDate
								? new Date(String(installDate))
								: new Date(),
						},
					});

					result.addonInstallations.created++;
				} catch (err) {
					result.addonInstallations.errors++;
					addError(
						"addonInstallations",
						`id=${row["id"]}: ${err instanceof Error ? err.message : String(err)}`,
					);
				}
			}
		});

		// ── Phase 14: Reconciliation ────────────────────────────
		// Runs AFTER the billing DB connection is closed.
		// Fixes data inconsistencies introduced by the raw import:
		//  1. Open the current billing cycle (sync creates all as CLOSED)
		// Reconciliation: unlock the current billing month so it's usable

		await updateProgress(operationId, { phase: "reconciliation" });

		const reconciliation = { fixed: 0, errors: 0 };

		try {
			const now = new Date();
			const activeYear = now.getFullYear();
			const activeMonth = now.getMonth() + 1;

			// Ensure the current month's billing record exists and is unlocked
			const activeMonthRecord = await db.billingMonth.upsert({
				where: {
					organizationId_year_month: {
						organizationId,
						year: activeYear,
						month: activeMonth,
					},
				},
				update: { locked: false },
				create: {
					organizationId,
					year: activeYear,
					month: activeMonth,
					locked: false,
				},
			});

			reconciliation.fixed++;
			logger.info("[Billing Sync] Ensured active month is unlocked", {
				monthId: activeMonthRecord.id,
				year: activeYear,
				month: activeMonth,
			});

			await updateProgress(operationId, {
				totalReconciled: 1,
				processedReconciled: 1,
			});
		} catch (err) {
			reconciliation.errors++;
			addError(
				"reconciliation",
				`${err instanceof Error ? err.message : String(err)}`,
			);
		}

		result.reconciliation.created = reconciliation.fixed;
		result.reconciliation.errors = reconciliation.errors;

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
