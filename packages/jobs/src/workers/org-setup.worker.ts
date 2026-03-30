import { db } from "@repo/database";
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
