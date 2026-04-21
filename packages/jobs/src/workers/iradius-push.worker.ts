/**
 * iRadius push worker — bulk-push every locally-authoritative customer field
 * to iRadius. The counterpart to `iradius-sync.worker.ts`, going the opposite
 * direction: local → iRadius.
 *
 * Pushed fields (per-customer): firstName, lastName, email, mobile, phone,
 * address, latitude, longitude, notes. Customers without `externalId` are
 * skipped. Each customer runs 6 UPDATE statements through a single shared SSH
 * tunnel to keep throughput reasonable.
 */

import { db } from "@repo/database";
import {
	executeIRadius,
	type IRadiusConnection,
	withIRadiusConnection,
} from "@repo/database/iradius";
import { logger } from "@repo/logs";
import { type Job, Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import { IRADIUS_PUSH_QUEUE_NAME } from "../queues/iradius-push.queue";
import type { IRadiusPushJobData, IRadiusPushJobResult } from "../types";

const PROGRESS_EVERY = 25;

interface PushError {
	customerId: string;
	externalId: string | null;
	detail: string;
}

async function updateProgress(
	operationId: string,
	data: Record<string, unknown>,
): Promise<void> {
	await db.iRadiusPushOperation.update({
		where: { id: operationId },
		data,
	});
}

async function pushCustomer(
	conn: IRadiusConnection,
	customer: {
		externalId: string;
		firstName: string | null;
		lastName: string | null;
		email: string | null;
		mobile: string | null;
		phone: string | null;
		address: string | null;
		latitude: number | null;
		longitude: number | null;
		notes: string | null;
	},
): Promise<void> {
	const userId = Number.parseInt(customer.externalId, 10);

	// User table — FirstName, LastName, MailAddress, Mobile, Phone, Address, Comment
	await executeIRadius(
		conn,
		`UPDATE User
		   SET FirstName = ?, LastName = ?, MailAddress = ?,
		       Mobile = ?, Phone = ?, Address = ?, Comment = ?,
		       UpdateDate = NOW()
		 WHERE Id = ?`,
		[
			customer.firstName ?? "",
			customer.lastName ?? "",
			customer.email,
			customer.mobile,
			customer.phone,
			customer.address,
			customer.notes,
			userId,
		],
	);

	// UserNas table — GSMLat, GSMLng (single UPDATE, may affect 0 rows if no UserNas)
	await executeIRadius(
		conn,
		"UPDATE UserNas SET GSMLat = ?, GSMLng = ? WHERE UserId = ?",
		[customer.latitude, customer.longitude, userId],
	);
}

export function createIRadiusPushWorker(): Worker<
	IRadiusPushJobData,
	IRadiusPushJobResult
> {
	return new Worker<IRadiusPushJobData, IRadiusPushJobResult>(
		IRADIUS_PUSH_QUEUE_NAME,
		async (job: Job<IRadiusPushJobData>) => {
			const { operationId, organizationId } = job.data;
			const errors: PushError[] = [];

			logger.info("[iRadius Push] Starting", {
				operationId,
				organizationId,
			});

			await updateProgress(operationId, {
				status: "in_progress",
				phase: "customers",
				startedAt: new Date(),
			});

			// Pull all linked customers for this org. Non-linked (no externalId)
			// customers get counted as skipped and never touch iRadius.
			const customers = await db.customer.findMany({
				where: { organizationId },
				select: {
					id: true,
					externalId: true,
					firstName: true,
					lastName: true,
					email: true,
					mobile: true,
					phone: true,
					address: true,
					latitude: true,
					longitude: true,
					notes: true,
				},
				orderBy: { accountNumber: "asc" },
			});

			const total = customers.length;
			const skipped = customers.filter((c) => !c.externalId).length;
			await updateProgress(operationId, {
				totalCustomers: total,
				skippedCustomers: skipped,
			});

			let processed = 0;
			let pushed = 0;
			let failed = 0;

			try {
				await withIRadiusConnection(async (conn) => {
					for (const c of customers) {
						if (!c.externalId) {
							processed++;
							continue;
						}

						try {
							await pushCustomer(conn, {
								externalId: c.externalId,
								firstName: c.firstName,
								lastName: c.lastName,
								email: c.email,
								mobile: c.mobile,
								phone: c.phone,
								address: c.address,
								latitude: c.latitude,
								longitude: c.longitude,
								notes: c.notes,
							});
							pushed++;
						} catch (err) {
							failed++;
							const detail =
								err instanceof Error
									? err.message
									: String(err);
							if (errors.length < 200) {
								errors.push({
									customerId: c.id,
									externalId: c.externalId,
									detail,
								});
							}
						}

						processed++;

						if (
							processed % PROGRESS_EVERY === 0 ||
							processed === total
						) {
							await updateProgress(operationId, {
								processedCustomers: processed,
								pushedCustomers: pushed,
								failedCustomers: failed,
							});
						}
					}
				});
			} catch (err) {
				const detail = err instanceof Error ? err.message : String(err);
				logger.error("[iRadius Push] Fatal error", { detail });
				await updateProgress(operationId, {
					status: "failed",
					completedAt: new Date(),
					processedCustomers: processed,
					pushedCustomers: pushed,
					failedCustomers: failed,
					result: {
						errors: [
							{
								phase: "connection",
								detail: `Tunnel/connection failed: ${detail}`,
							},
							...errors.map((e) => ({
								phase: "customers",
								detail: `Customer ${e.externalId ?? e.customerId}: ${e.detail}`,
							})),
						],
					},
				});
				return { success: false, operationId };
			}

			await updateProgress(operationId, {
				status: "completed",
				completedAt: new Date(),
				processedCustomers: processed,
				pushedCustomers: pushed,
				failedCustomers: failed,
				result: {
					errors: errors.map((e) => ({
						phase: "customers",
						detail: `Customer ${e.externalId ?? e.customerId}: ${e.detail}`,
					})),
				},
			});

			logger.info("[iRadius Push] Completed", {
				operationId,
				total,
				pushed,
				skipped,
				failed,
			});

			return { success: true, operationId };
		},
		{
			connection: getRedisConnection(),
			concurrency: 1,
		},
	);
}
