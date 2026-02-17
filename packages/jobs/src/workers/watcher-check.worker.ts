import { createId } from "@paralleldrive/cuid2";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { type Job, Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import {
	type CheckResult,
	checkPort,
	dnsResolve,
	httpCheck,
	tcpPing,
	validateHost,
} from "../lib/network-checks";
import {
	dispatchWatcherNotifications,
	parseNotificationConfig,
} from "../lib/watcher-notifications";
import { WATCHER_CHECK_QUEUE_NAME } from "../queues/watcher-check.queue";
import type { WatcherCheckJobData, WatcherCheckJobResult } from "../types";

const FAILURE_THRESHOLD = 3;

export interface WatcherNotificationPayload {
	organizationId: string;
	category: "monitoring";
	type: "error" | "success";
	title: string;
	message: string;
	emailSubject: string;
	emailHtml: string;
}

export interface WatcherCheckWorkerDeps {
	sendOrganizationNotification: (
		organizationId: string,
		payload: Omit<WatcherNotificationPayload, "organizationId">,
	) => Promise<void>;
}

async function runCheck(data: WatcherCheckJobData): Promise<CheckResult> {
	const config = data.config ?? {};

	switch (data.type) {
		case "ping": {
			const port = (config["port"] as number) ?? 80;
			const hostError = validateHost(data.target);
			if (hostError) {
				return { success: false, message: hostError };
			}
			try {
				const rtt = await tcpPing(data.target, port, 10000);
				return {
					success: true,
					latencyMs: Math.round(rtt),
					message: `TCP ping OK (${Math.round(rtt)}ms)`,
				};
			} catch (error) {
				return {
					success: false,
					message: `TCP ping failed: ${error instanceof Error ? error.message : "Unknown error"}`,
				};
			}
		}
		case "http": {
			return httpCheck(data.target, {
				method: config["method"] as string | undefined,
				expectedStatus: config["expectedStatus"] as number | undefined,
				timeout: 10000,
				headers: config["headers"] as
					| Record<string, string>
					| undefined,
			});
		}
		case "port": {
			const port = (config["port"] as number) ?? 80;
			const hostError = validateHost(data.target);
			if (hostError) {
				return { success: false, message: hostError };
			}
			return checkPort(data.target, port, 10000);
		}
		case "dns": {
			const recordType = (config["recordType"] as string) ?? "A";
			const hostError = validateHost(data.target);
			if (hostError) {
				return { success: false, message: hostError };
			}
			return dnsResolve(data.target, recordType, 10000);
		}
		default:
			return {
				success: false,
				message: `Unknown watcher type: ${data.type}`,
			};
	}
}

export function createWatcherCheckWorker(
	deps: WatcherCheckWorkerDeps,
): Worker<WatcherCheckJobData, WatcherCheckJobResult> {
	return new Worker<WatcherCheckJobData, WatcherCheckJobResult>(
		WATCHER_CHECK_QUEUE_NAME,
		async (job: Job<WatcherCheckJobData>) => {
			const { data } = job;

			logger.info(`Running watcher check ${data.watcherId}`, {
				type: data.type,
				target: data.target,
			});

			const result = await runCheck(data);
			const status = result.success ? "up" : "down";

			// Create execution record
			await db.watcherExecution.create({
				data: {
					id: createId(),
					watcherId: data.watcherId,
					status,
					latencyMs: result.latencyMs ?? null,
					message: result.message,
				},
			});

			// Get current watcher state
			const watcher = await db.watcher.findUnique({
				where: { id: data.watcherId },
				select: {
					id: true,
					name: true,
					status: true,
					consecutiveFails: true,
					consecutiveOk: true,
					notifiedDownAt: true,
					notificationConfig: true,
					lastReminderAt: true,
					organizationId: true,
				},
			});

			if (!watcher) {
				return { success: result.success, message: result.message };
			}

			const updateData: Record<string, unknown> = {
				lastCheckedAt: new Date(),
				status,
			};

			if (result.success) {
				updateData["consecutiveOk"] = watcher.consecutiveOk + 1;
				updateData["consecutiveFails"] = 0;

				// Recovery: was down (notified) and now back up
				if (watcher.notifiedDownAt && watcher.status === "down") {
					updateData["notifiedDownAt"] = null;
					updateData["lastReminderAt"] = null;
					updateData["lastStatusChange"] = new Date();

					const notifConfig = parseNotificationConfig(
						watcher.notificationConfig,
					);
					if (notifConfig) {
						dispatchWatcherNotifications(notifConfig, {
							watcherName: watcher.name,
							eventType: "recovery",
							message: result.message,
						}).catch((err: unknown) => {
							logger.error(
								"Failed to send per-watcher recovery notification",
								{
									watcherId: watcher.id,
									error: err,
								},
							);
						});
					} else {
						deps.sendOrganizationNotification(
							watcher.organizationId,
							{
								category: "monitoring",
								type: "success",
								title: `${watcher.name} recovered`,
								message: `${watcher.name} is back up. ${result.message}`,
								emailSubject: `[Recovered] ${watcher.name} is back up`,
								emailHtml: `<p><strong>${watcher.name}</strong> is back up and responding normally.</p><p>${result.message}</p>`,
							},
						).catch((err: unknown) => {
							logger.error(
								"Failed to send recovery notification",
								{
									watcherId: watcher.id,
									error: err,
								},
							);
						});
					}
				} else if (watcher.status !== "up") {
					updateData["lastStatusChange"] = new Date();
				}
			} else {
				updateData["consecutiveFails"] = watcher.consecutiveFails + 1;
				updateData["consecutiveOk"] = 0;

				const newFailCount = watcher.consecutiveFails + 1;

				// Notify on reaching threshold (first time for this incident)
				if (
					newFailCount >= FAILURE_THRESHOLD &&
					!watcher.notifiedDownAt
				) {
					updateData["notifiedDownAt"] = new Date();
					updateData["lastStatusChange"] = new Date();

					const notifConfig = parseNotificationConfig(
						watcher.notificationConfig,
					);
					if (notifConfig) {
						dispatchWatcherNotifications(notifConfig, {
							watcherName: watcher.name,
							eventType: "down",
							message: `${watcher.name} has failed ${newFailCount} consecutive checks. ${result.message}`,
						}).catch((err: unknown) => {
							logger.error(
								"Failed to send per-watcher down notification",
								{
									watcherId: watcher.id,
									error: err,
								},
							);
						});
					} else {
						deps.sendOrganizationNotification(
							watcher.organizationId,
							{
								category: "monitoring",
								type: "error",
								title: `${watcher.name} is down`,
								message: `${watcher.name} has failed ${newFailCount} consecutive checks. ${result.message}`,
								emailSubject: `[Down] ${watcher.name} is not responding`,
								emailHtml: `<p><strong>${watcher.name}</strong> has been unreachable for ${newFailCount} consecutive checks.</p><p>Last error: ${result.message}</p>`,
							},
						).catch((err: unknown) => {
							logger.error("Failed to send down notification", {
								watcherId: watcher.id,
								error: err,
							});
						});
					}
				} else if (
					newFailCount >= FAILURE_THRESHOLD &&
					watcher.notifiedDownAt
				) {
					// Reminder: watcher is still down and already notified
					const notifConfig = parseNotificationConfig(
						watcher.notificationConfig,
					);
					if (notifConfig?.events.reminder) {
						const intervalMs =
							(notifConfig.reminderIntervalMinutes ?? 60) *
							60_000;
						const lastNotified =
							watcher.lastReminderAt ?? watcher.notifiedDownAt;
						const now = Date.now();
						if (
							lastNotified &&
							now - new Date(lastNotified).getTime() >= intervalMs
						) {
							updateData["lastReminderAt"] = new Date();
							dispatchWatcherNotifications(notifConfig, {
								watcherName: watcher.name,
								eventType: "reminder",
								message: `${watcher.name} has been down for ${newFailCount} consecutive checks. ${result.message}`,
							}).catch((err: unknown) => {
								logger.error(
									"Failed to send per-watcher reminder notification",
									{
										watcherId: watcher.id,
										error: err,
									},
								);
							});
						}
					}
				}

				if (
					watcher.status !== "down" &&
					newFailCount >= FAILURE_THRESHOLD
				) {
					updateData["lastStatusChange"] = new Date();
				}
			}

			await db.watcher.update({
				where: { id: data.watcherId },
				data: updateData,
			});

			return {
				success: result.success,
				latencyMs: result.latencyMs,
				message: result.message,
			};
		},
		{
			connection: getRedisConnection(),
			concurrency: 20,
		},
	);
}
