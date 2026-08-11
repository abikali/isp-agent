import { db } from "@repo/database";
import {
	DEFAULT_WORKER_OPTIONS,
	WORKER_OPTION_LIST_KEYS,
} from "@repo/database/worker-options";
import { logger } from "@repo/logs";
import { type Job, Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import { ORG_SETUP_QUEUE_NAME } from "../queues/org-setup.queue";
import type { OrgSetupJobData, OrgSetupJobResult } from "../types";

const DEFAULT_NOTE_CATEGORIES = [
	{ value: "DOWNGRADE", label: "Downgrade", labelAr: "تصغير", sortOrder: 1 },
	{ value: "UPGRADE", label: "Upgrade", labelAr: "تكبير", sortOrder: 2 },
	{ value: "DISCOUNT", label: "Discount", labelAr: "خصم", sortOrder: 3 },
	{
		value: "REFERRAL",
		label: "Referral",
		labelAr: "احضر صديق",
		sortOrder: 4,
	},
	{ value: "MOVED", label: "Moved", labelAr: "انتقل", sortOrder: 5 },
	{
		value: "POOR_SERVICE",
		label: "Poor Service",
		labelAr: "انترنت غير جيد",
		sortOrder: 6,
	},
	{
		value: "CANT_PAY",
		label: "Can't Pay",
		labelAr: "لا يستطيع الدفع",
		sortOrder: 7,
	},
	{
		value: "TEMP_STOP",
		label: "Temp Stop",
		labelAr: "توقيف مؤقت",
		sortOrder: 8,
	},
];

async function seedNoteCategories(organizationId: string): Promise<number> {
	let created = 0;

	for (const cat of DEFAULT_NOTE_CATEGORIES) {
		await db.noteCategory.upsert({
			where: {
				organizationId_value: {
					organizationId,
					value: cat.value,
				},
			},
			update: {},
			create: {
				organizationId,
				value: cat.value,
				label: cat.label,
				labelAr: cat.labelAr,
				sortOrder: cat.sortOrder,
			},
		});
		created++;
	}

	return created;
}

/** Seed the worker-portal dropdown options (expense categories, resolutions). */
async function seedWorkerOptions(organizationId: string): Promise<number> {
	let created = 0;

	for (const listKey of WORKER_OPTION_LIST_KEYS) {
		for (const opt of DEFAULT_WORKER_OPTIONS[listKey]) {
			await db.workerOption.upsert({
				where: {
					organizationId_listKey_value: {
						organizationId,
						listKey,
						value: opt.value,
					},
				},
				update: {},
				create: {
					organizationId,
					listKey,
					value: opt.value,
					label: opt.label,
					labelAr: opt.labelAr ?? null,
					sortOrder: opt.sortOrder,
				},
			});
			created++;
		}
	}

	return created;
}

export function createOrgSetupWorker(): Worker<
	OrgSetupJobData,
	OrgSetupJobResult
> {
	return new Worker<OrgSetupJobData, OrgSetupJobResult>(
		ORG_SETUP_QUEUE_NAME,
		async (job: Job<OrgSetupJobData>) => {
			const { organizationId } = job.data;
			logger.info(
				`[org-setup] Setting up organization ${organizationId}`,
			);

			// Verify the organization exists
			const org = await db.organization.findUnique({
				where: { id: organizationId },
				select: { id: true, name: true },
			});

			if (!org) {
				logger.warn(
					`[org-setup] Organization ${organizationId} not found, skipping`,
				);
				return { success: false };
			}

			// Seed note categories
			const catCount = await seedNoteCategories(organizationId);
			logger.info(
				`[org-setup] Seeded ${catCount} note categories for "${org.name}"`,
			);

			// Seed worker-portal dropdown options
			const optCount = await seedWorkerOptions(organizationId);
			logger.info(
				`[org-setup] Seeded ${optCount} worker options for "${org.name}"`,
			);

			logger.info(
				`[org-setup] Organization "${org.name}" setup complete`,
			);
			return { success: true };
		},
		{
			connection: getRedisConnection(),
			concurrency: 3,
		},
	);
}
