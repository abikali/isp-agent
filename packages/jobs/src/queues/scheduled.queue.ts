import { Queue } from "bullmq";
import { getRedisConnection } from "../connection";
import type { ScheduledJobData } from "../types";

export const SCHEDULED_QUEUE_NAME = "scheduled";

let scheduledQueue: Queue<ScheduledJobData> | null = null;

export function getScheduledQueue(): Queue<ScheduledJobData> {
	if (!scheduledQueue) {
		scheduledQueue = new Queue<ScheduledJobData>(SCHEDULED_QUEUE_NAME, {
			connection: getRedisConnection(),
			defaultJobOptions: {
				attempts: 3,
				backoff: {
					type: "exponential",
					delay: 5000,
				},
				removeOnComplete: {
					age: 7 * 24 * 60 * 60, // 7 days
					count: 500,
				},
				removeOnFail: {
					age: 30 * 24 * 60 * 60, // 30 days
				},
			},
		});
	}
	return scheduledQueue;
}

export async function setupScheduledJobs(): Promise<void> {
	const queue = getScheduledQueue();

	// Process account deletions every hour
	await queue.upsertJobScheduler(
		"process-account-deletions",
		{
			pattern: "0 * * * *", // Every hour at minute 0
		},
		{
			name: "process-account-deletions",
			data: { type: "account-deletion" },
		},
	);

	// Reset daily quotas at midnight UTC
	await queue.upsertJobScheduler(
		"reset-daily-quotas",
		{
			pattern: "0 0 * * *", // Every day at midnight
		},
		{
			name: "reset-daily-quotas",
			data: { type: "quota-reset" },
		},
	);

	// Watcher scheduler - dispatch due watcher checks every minute
	await queue.upsertJobScheduler(
		"watcher-scheduler",
		{
			pattern: "* * * * *", // Every minute
		},
		{
			name: "watcher-scheduler",
			data: { type: "watcher-scheduler" },
		},
	);

	// Sync online/offline status + daily usage from iRadius every 15 seconds
	// — same cadence as network-monitor-sync, mirroring iRadius's own monitor
	// refresh rate so the customers table feels live.
	await queue.upsertJobScheduler(
		"online-status-sync",
		{
			every: 15000,
		},
		{
			name: "online-status-sync",
			data: { type: "online-status-sync" },
		},
	);

	// Sync Station + AccessPoint monitor fields (online, uptime, signal, …)
	// from iRadius every 15 seconds — mirrors iRadius's own monitor cadence.
	await queue.upsertJobScheduler(
		"network-monitor-sync",
		{
			every: 15000,
		},
		{
			name: "network-monitor-sync",
			data: { type: "network-monitor-sync" },
		},
	);

	// Dealers + their receivable ledgers from iRadius every 30 minutes. The
	// owner's Dealers page reads the local mirror; before this the mirror only
	// moved when a platform admin pressed "Sync dealers" (prod was four days
	// and ~280 ledger rows behind on 2026-09-02).
	await queue.upsertJobScheduler(
		"dealer-sync",
		{
			pattern: "*/30 * * * *",
		},
		{
			name: "dealer-sync",
			data: { type: "dealer-sync" },
		},
	);

	// Recurring costs (rent, upstream link, maintenance fees) become approved
	// expenses once a month on their day. Daily so a line whose day has passed
	// is never missed; the generator is idempotent per month.
	await queue.upsertJobScheduler(
		"recurring-expenses",
		{
			pattern: "15 3 * * *",
		},
		{
			name: "recurring-expenses",
			data: { type: "recurring-expenses" },
		},
	);

	// Task due reminders are delayed jobs; this re-queues any whose window
	// opened without a send (lost Redis job, deploy gap).
	await queue.upsertJobScheduler(
		"task-reminder-sweep",
		{
			pattern: "*/5 * * * *",
		},
		{
			name: "task-reminder-sweep",
			data: { type: "task-reminder-sweep" },
		},
	);

	// Is the LibanCom bridge servlet still in the iRadius Tomcat app? A vendor
	// ROOT.war redeploy wipes it silently (2026-09-16), after which approvals
	// stop billing the dealer. Hourly GET: 405 = present, 404 = wiped → alert.
	await queue.upsertJobScheduler(
		"iradius-bridge-probe",
		{
			pattern: "7 * * * *",
		},
		{
			name: "iradius-bridge-probe",
			data: { type: "iradius-bridge-probe" },
		},
	);

	// Fiber control room: chats / stops / escalations about fiber or Ogero
	// become fiber leads. Overlapping window so a slow run misses nothing;
	// signals are idempotent.
	await queue.upsertJobScheduler(
		"fiber-signals",
		{ pattern: "*/10 * * * *" },
		{ name: "fiber-signals", data: { type: "fiber-signals" } },
	);

	// Conversation summaries: summarise every conversation that went idle
	// (agents with conversationSummaryMode != "off").
	await queue.upsertJobScheduler(
		"conversation-summaries",
		{ pattern: "*/10 * * * *" },
		{
			name: "conversation-summaries",
			data: { type: "conversation-summaries" },
		},
	);

	// Daily digest of the day's summaries for agents in "digest" mode,
	// 18:00 UTC = 21:00 Beirut (summer).
	await queue.upsertJobScheduler(
		"conversation-summary-digest",
		{ pattern: "0 18 * * *" },
		{
			name: "conversation-summary-digest",
			data: { type: "conversation-summary-digest" },
		},
	);

	// Bot follow-ups: send due check-backs and outreach, expire stale ones.
	// The bot_follow_up table is the queue.
	await queue.upsertJobScheduler(
		"bot-follow-ups",
		{ pattern: "*/5 * * * *" },
		{ name: "bot-follow-ups", data: { type: "bot-follow-ups" } },
	);

	// Recover official-number answers the Salti webhook missed (it never
	// retries): 01:30 UTC nightly.
	await queue.upsertJobScheduler(
		"outreach-reconcile",
		{ pattern: "30 1 * * *" },
		{ name: "outreach-reconcile", data: { type: "outreach-reconcile" } },
	);

	// Customer payment reminders: invoices expiring tomorrow and still unpaid
	// get a WhatsApp + SMS at 10:00 Beirut (legacy iRadius sent at 09:05).
	// Only orgs with reminders allowed + enabled send anything.
	await queue.upsertJobScheduler(
		"expiry-reminders",
		{ pattern: "0 10 * * *", tz: "Asia/Beirut" },
		{ name: "expiry-reminders", data: { type: "expiry-reminders" } },
	);

	// An hour later (retries are done): alert the org's admin Telegram chat
	// when most of today's reminders failed (SMS credit out, template rejected).
	await queue.upsertJobScheduler(
		"expiry-reminders-report",
		{ pattern: "0 11 * * *", tz: "Asia/Beirut" },
		{
			name: "expiry-reminders-report",
			data: { type: "expiry-reminders-report" },
		},
	);

	// Watcher cleanup - delete old execution records daily at 2:30 AM
	await queue.upsertJobScheduler(
		"watcher-cleanup",
		{
			pattern: "30 2 * * *", // Daily at 2:30 AM
		},
		{
			name: "watcher-cleanup",
			data: { type: "watcher-cleanup" },
		},
	);
}

export async function closeScheduledQueue(): Promise<void> {
	if (scheduledQueue) {
		await scheduledQueue.close();
		scheduledQueue = null;
	}
}
