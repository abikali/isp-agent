import { getOrgSetupQueue } from "../queues/org-setup.queue";

export async function queueOrgSetup(organizationId: string): Promise<string> {
	const queue = getOrgSetupQueue();
	const job = await queue.add("org-setup", { organizationId });
	return job.id ?? "";
}
