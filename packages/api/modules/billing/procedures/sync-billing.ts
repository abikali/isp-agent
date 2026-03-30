import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import {
	queryBilling,
	testBillingConnection,
	withBillingConnection,
} from "@repo/database/billing";
import { queueBillingSync } from "@repo/jobs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

// ---------------------------------------------------------------------------
// Test connection
// ---------------------------------------------------------------------------

export const testBilling = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/sync/test",
		tags: ["Billing"],
		summary: "Test billing system connectivity and return table counts",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		return testBillingConnection();
	});

// ---------------------------------------------------------------------------
// Preview sync — show what will be imported vs skipped
// ---------------------------------------------------------------------------

export const previewBillingSync = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/sync/preview",
		tags: ["Billing"],
		summary:
			"Preview what billing sync will import vs skip due to unmatched employees/customers",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const { organizationId } = input;

		// Build the same lookup maps the worker uses
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

		const customers = await db.customer.findMany({
			where: { organizationId, username: { not: null } },
			select: { id: true, username: true },
		});
		const customerUsernameMap = new Map<string, string>();
		for (const cust of customers) {
			if (cust.username) {
				customerUsernameMap.set(cust.username.toLowerCase(), cust.id);
			}
		}

		function hasEmployee(name: string | null | undefined): boolean {
			if (!name) {
				return false;
			}
			return employeeNameMap.has(name.toLowerCase());
		}

		function hasCustomer(username: string | null | undefined): boolean {
			if (!username) {
				return false;
			}
			return customerUsernameMap.has(username.toLowerCase());
		}

		return withBillingConnection(async (conn) => {
			// Customers — skipped if username not in local DB
			const johnRows = await queryBilling(
				conn,
				"SELECT username FROM john",
			);
			const unmatchedCustomerUsernames = new Set<string>();
			let customerMatched = 0;
			for (const row of johnRows) {
				const username = row["username"] as string | null;
				if (hasCustomer(username)) {
					customerMatched++;
				} else if (username) {
					unmatchedCustomerUsernames.add(username);
				}
			}

			// Payments — skipped if customer OR collector not found
			// Also track unmatched worker names (for workerId mapping)
			const paymentRows = await queryBilling(
				conn,
				"SELECT username, collector, worker FROM john_payment",
			);
			const unmatchedPaymentCollectors = new Set<string>();
			const unmatchedPaymentCustomers = new Set<string>();
			const unmatchedPaymentWorkers = new Set<string>();
			let paymentMatched = 0;
			let paymentSkipped = 0;
			for (const row of paymentRows) {
				const username = row["username"] as string | null;
				const collector = row["collector"] as string | null;
				const worker = row["worker"] as string | null;
				const custOk = hasCustomer(username);
				const collOk = hasEmployee(collector);
				if (custOk && collOk) {
					paymentMatched++;
				} else {
					paymentSkipped++;
					if (!custOk && username) {
						unmatchedPaymentCustomers.add(username);
					}
					if (!collOk && collector) {
						unmatchedPaymentCollectors.add(collector);
					}
				}
				// Track unmatched workers (these don't cause skips, but need mapping for balance)
				if (worker?.trim() && !hasEmployee(worker.trim())) {
					unmatchedPaymentWorkers.add(worker.trim());
				}
			}

			// Collections — skipped if collector not found
			const collectionRows = await queryBilling(
				conn,
				"SELECT collector FROM john_collection",
			);
			const unmatchedCollectionCollectors = new Set<string>();
			let collectionMatched = 0;
			let collectionSkipped = 0;
			for (const row of collectionRows) {
				const collector = row["collector"] as string | null;
				if (hasEmployee(collector)) {
					collectionMatched++;
				} else {
					collectionSkipped++;
					if (collector) {
						unmatchedCollectionCollectors.add(collector);
					}
				}
			}

			// Expenses — skipped if worker not found
			const expenseRows = await queryBilling(
				conn,
				"SELECT worker_username FROM expenses",
			);
			const unmatchedExpenseWorkers = new Set<string>();
			let expenseMatched = 0;
			let expenseSkipped = 0;
			for (const row of expenseRows) {
				const worker = row["worker_username"] as string | null;
				if (hasEmployee(worker)) {
					expenseMatched++;
				} else {
					expenseSkipped++;
					if (worker) {
						unmatchedExpenseWorkers.add(worker);
					}
				}
			}

			// Installations — skipped if customer OR worker not found
			const installRows = await queryBilling(
				conn,
				"SELECT customer_username, worker_username FROM installations",
			);
			const unmatchedInstallWorkers = new Set<string>();
			const unmatchedInstallCustomers = new Set<string>();
			let installMatched = 0;
			let installSkipped = 0;
			for (const row of installRows) {
				const username = row["customer_username"] as string | null;
				const worker = row["worker_username"] as string | null;
				const custOk = hasCustomer(username);
				const wrkOk = hasEmployee(worker);
				if (custOk && wrkOk) {
					installMatched++;
				} else {
					installSkipped++;
					if (!custOk && username) {
						unmatchedInstallCustomers.add(username);
					}
					if (!wrkOk && worker) {
						unmatchedInstallWorkers.add(worker);
					}
				}
			}

			// Collect all unique unmatched names
			const allUnmatchedEmployees = new Set<string>();
			for (const s of [
				unmatchedPaymentCollectors,
				unmatchedPaymentWorkers,
				unmatchedCollectionCollectors,
				unmatchedExpenseWorkers,
				unmatchedInstallWorkers,
			]) {
				for (const name of s) {
					allUnmatchedEmployees.add(name);
				}
			}

			const allUnmatchedCustomers = new Set<string>();
			for (const s of [
				unmatchedCustomerUsernames,
				unmatchedPaymentCustomers,
				unmatchedInstallCustomers,
			]) {
				for (const name of s) {
					allUnmatchedCustomers.add(name);
				}
			}

			// Fetch role/phone info for unmatched employees from isplogin
			const employeeInfoMap = new Map<
				string,
				{ role: string; phone: string | null; telegram: string | null }
			>();
			if (allUnmatchedEmployees.size > 0) {
				const loginRows = await queryBilling(
					conn,
					"SELECT username, role, phone, telegram FROM isplogin",
				);
				for (const row of loginRows) {
					const username = row["username"] as string | null;
					const role = row["role"] as string | null;
					if (username && role) {
						employeeInfoMap.set(username.toLowerCase(), {
							role,
							phone: (row["phone"] as string) ?? null,
							telegram: (row["telegram"] as string) ?? null,
						});
					}
				}
			}

			// Fetch dealer info for unmatched customers from john_full
			const customerDealerMap = new Map<string, string>();
			if (allUnmatchedCustomers.size > 0) {
				const dealerRows = await queryBilling(
					conn,
					"SELECT username, dealer FROM john_full WHERE dealer IS NOT NULL AND dealer != ''",
				);
				for (const row of dealerRows) {
					const username = row["username"] as string | null;
					const dealer = row["dealer"] as string | null;
					if (username && dealer) {
						customerDealerMap.set(username.toLowerCase(), dealer);
					}
				}
			}

			// Build unmatched customers with dealer info
			function customersWithDealers(usernames: string[]) {
				return usernames.map((username) => ({
					username,
					dealer:
						customerDealerMap.get(username.toLowerCase()) ?? null,
				}));
			}

			return {
				phases: {
					customers: {
						total: johnRows.length,
						matched: customerMatched,
						skipped: unmatchedCustomerUsernames.size,
						reason: "customer username not found locally",
						unmatchedCustomers: customersWithDealers(
							[...unmatchedCustomerUsernames].sort(),
						),
						unmatchedEmployees: [] as string[],
					},
					payments: {
						total: paymentRows.length,
						matched: paymentMatched,
						skipped: paymentSkipped,
						reason: "customer or collector not found",
						unmatchedCustomers: customersWithDealers(
							[...unmatchedPaymentCustomers].sort(),
						),
						unmatchedEmployees: [
							...unmatchedPaymentCollectors,
						].sort(),
					},
					collections: {
						total: collectionRows.length,
						matched: collectionMatched,
						skipped: collectionSkipped,
						reason: "collector not found",
						unmatchedCustomers: [] as Array<{
							username: string;
							dealer: string | null;
						}>,
						unmatchedEmployees: [
							...unmatchedCollectionCollectors,
						].sort(),
					},
					expenses: {
						total: expenseRows.length,
						matched: expenseMatched,
						skipped: expenseSkipped,
						reason: "worker not found",
						unmatchedCustomers: [] as Array<{
							username: string;
							dealer: string | null;
						}>,
						unmatchedEmployees: [...unmatchedExpenseWorkers].sort(),
					},
					installations: {
						total: installRows.length,
						matched: installMatched,
						skipped: installSkipped,
						reason: "customer or worker not found",
						unmatchedCustomers: customersWithDealers(
							[...unmatchedInstallCustomers].sort(),
						),
						unmatchedEmployees: [...unmatchedInstallWorkers].sort(),
					},
				},
				unmatchedEmployees: [...allUnmatchedEmployees]
					.sort()
					.map((name) => {
						const info = employeeInfoMap.get(name.toLowerCase());
						return {
							username: name,
							role: info?.role ?? null,
							phone: info?.phone ?? null,
							telegram: info?.telegram ?? null,
						};
					}),
				unmatchedCustomers: customersWithDealers(
					[...allUnmatchedCustomers].sort(),
				),
			};
		});
	});

// ---------------------------------------------------------------------------
// Trigger sync
// ---------------------------------------------------------------------------

export const syncFromBilling = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/sync/start",
		tags: ["Billing"],
		summary: "Queue a full data sync from billing system",
	})
	.input(
		z.object({
			organizationId: z.string(),
			employeeMappings: z
				.record(
					z.string(),
					z.object({
						action: z.enum(["skip", "create", "map"]),
						targetEmployeeId: z.string().optional(),
						createName: z.string().optional(),
						role: z.string().optional(),
						phone: z.string().optional(),
						telegram: z.string().optional(),
					}),
				)
				.optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const active = await db.billingSyncOperation.findFirst({
			where: {
				organizationId: input.organizationId,
				status: { in: ["pending", "in_progress"] },
			},
		});
		if (active) {
			throw new ORPCError("CONFLICT", {
				message:
					"A billing sync is already in progress. Please wait for it to complete.",
			});
		}

		const operation = await db.billingSyncOperation.create({
			data: {
				organizationId: input.organizationId,
				status: "pending",
			},
		});

		await queueBillingSync({
			operationId: operation.id,
			organizationId: input.organizationId,
			employeeMappings: input.employeeMappings,
		});

		return { operationId: operation.id };
	});

// ---------------------------------------------------------------------------
// Poll sync status
// ---------------------------------------------------------------------------

export const getBillingSyncStatus = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/sync/status",
		tags: ["Billing"],
		summary: "Get the status of a billing sync operation",
	})
	.input(
		z.object({
			organizationId: z.string(),
			operationId: z.string().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const operation = input.operationId
			? await db.billingSyncOperation.findUnique({
					where: { id: input.operationId },
				})
			: await db.billingSyncOperation.findFirst({
					where: { organizationId: input.organizationId },
					orderBy: { createdAt: "desc" },
				});

		return { operation };
	});
