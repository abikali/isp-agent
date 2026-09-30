import type { Prisma } from "@repo/database";

/**
 * "Open field work" as the Tasks page and the create-task notice count it:
 * waiting or awaiting approval, created by people (MANUAL) or migrated from
 * the legacy billing app (LEGACY). AI escalations and system reviews are not
 * field work.
 */
export const FIELD_TASK_OPEN_FILTER = {
	status: { in: ["OPEN", "PENDING_APPROVAL"] },
	source: { in: ["MANUAL", "LEGACY"] },
} satisfies Prisma.TaskWhereInput;
