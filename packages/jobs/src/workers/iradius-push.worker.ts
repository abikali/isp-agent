/**
 * iRadius push worker — bulk-push every locally-authoritative customer field
 * to iRadius. The counterpart to `iradius-sync.worker.ts`, going the opposite
 * direction: local → iRadius.
 *
 * Pushed fields (per-customer): firstName, lastName, email, address, notes,
 * latitude, longitude, and the full phones array — dash-joined (primary
 * first, dedup) into `User.Mobile`. `User.Phone` is intentionally left
 * untouched. Customers without `externalId` are skipped. Each customer runs
 * 2 UPDATE statements (one on User, one on UserNas). Customers are fanned
 * out across a pool of parallel MySQL connections over a shared SSH tunnel
 * — a single connection serialises queries, so fan-out is the only way to
 * amortise the ~250ms SSH+MySQL round-trip cost.
 *
 * Dealer scope: customers are filtered by the org's `activeDealerId`,
 * mirroring `getDealerScopeFilter` in permission.ts. Without this filter,
 * a sync would import cross-dealer customers from iRadius (e.g. sakonet's)
 * into our org and the push would overwrite their iRadius `User.Mobile`
 * with our locally-normalized `+961…` phones — clobbering another dealer's
 * data. See incident 2026-05-08 for the regression this guard prevents.
 */

import { buildIRadiusMobile, db } from "@repo/database";
import {
	executeIRadius,
	type IRadiusConnection,
	withIRadiusConnectionPool,
} from "@repo/database/iradius";
import { logger } from "@repo/logs";
import { type Job, Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import { IRADIUS_PUSH_QUEUE_NAME } from "../queues/iradius-push.queue";
import type { IRadiusPushJobData, IRadiusPushJobResult } from "../types";

const PROGRESS_EVERY = 100;
const POOL_SIZE = 10;

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
		address: string | null;
		latitude: number | null;
		longitude: number | null;
		notes: string | null;
	},
): Promise<void> {
	const userId = Number.parseInt(customer.externalId, 10);

	// User table — FirstName, LastName, MailAddress, Mobile, Address, Comment.
	// Phone column is intentionally left untouched; all local phones are dash-
	// joined into Mobile by the caller (primary first, deduped).
	await executeIRadius(
		conn,
		`UPDATE User
		   SET FirstName = ?, LastName = ?, MailAddress = ?,
		       Mobile = ?, Address = ?, Comment = ?,
		       UpdateDate = NOW()
		 WHERE Id = ?`,
		[
			customer.firstName ?? "",
			customer.lastName ?? "",
			customer.email,
			customer.mobile,
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

			// Belt-and-suspenders: refuse to run for orgs with iRadius disabled.
			const org = await db.organization.findUnique({
				where: { id: organizationId },
				select: { iradiusDisabled: true, activeDealerId: true },
			});
			if (org?.iradiusDisabled) {
				await updateProgress(operationId, {
					status: "failed",
					completedAt: new Date(),
					result: {
						errors: [
							{
								phase: "guard",
								detail: "iRadius is disabled for this organization",
							},
						],
					},
				});
				return { success: false, operationId };
			}
			const activeDealerId = org?.activeDealerId ?? null;

			logger.info("[iRadius Push] Starting", {
				operationId,
				organizationId,
			});

			await updateProgress(operationId, {
				status: "in_progress",
				phase: "customers",
				startedAt: new Date(),
			});

			// Pull all linked customers for this org, scoped to the org's
			// `activeDealerId` (same semantics as `getDealerScopeFilter` in
			// permission.ts: customers whose `dealerId` does not match are
			// invisible everywhere else in the app, and must also be invisible
			// here so we don't push them back to iRadius). Non-linked (no
			// externalId) customers get counted as skipped and never touch
			// iRadius.
			const customers = await db.customer.findMany({
				where: { organizationId, dealerId: activeDealerId },
				select: {
					id: true,
					externalId: true,
					firstName: true,
					lastName: true,
					email: true,
					phones: true,
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
			let cancelled = false;
			// Serialises progress writes so parallel workers don't stampede
			// updates for the same DB row.
			let progressLock: Promise<void> = Promise.resolve();

			const checkpoint = async (): Promise<void> => {
				const current = await db.iRadiusPushOperation.findUnique({
					where: { id: operationId },
					select: { status: true },
				});
				if (!current || current.status !== "in_progress") {
					logger.info(
						"[iRadius Push] Stopping: operation no longer in_progress",
						{
							operationId,
							status: current?.status ?? "missing",
							processed,
						},
					);
					cancelled = true;
					return;
				}
				await updateProgress(operationId, {
					processedCustomers: processed,
					pushedCustomers: pushed,
					failedCustomers: failed,
				});
			};

			try {
				await withIRadiusConnectionPool(POOL_SIZE, async (conns) => {
					// Workers race to claim the next index from a shared
					// cursor. This gives natural load-balancing — fast
					// connections grab more work, slow ones grab less —
					// without needing an explicit queue.
					let cursor = 0;

					const workerLoop = async (
						conn: IRadiusConnection,
					): Promise<void> => {
						while (!cancelled) {
							const idx = cursor++;
							if (idx >= customers.length) {
								return;
							}
							const c = customers[idx];
							if (!c) {
								return;
							}

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
									mobile: buildIRadiusMobile(c.phones),
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
								progressLock = progressLock.then(checkpoint);
								await progressLock;
							}
						}
					};

					await Promise.all(conns.map(workerLoop));
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

			if (cancelled) {
				logger.info("[iRadius Push] Exited after cancellation", {
					operationId,
					processed,
					pushed,
					failed,
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
