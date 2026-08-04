import { assignEmployees } from "./procedures/assign-employees";
import { completeTaskWithEvidence } from "./procedures/complete-with-evidence";
import { createTask } from "./procedures/create";
import { deleteTask } from "./procedures/delete";
import { createEvidenceUploadUrl } from "./procedures/evidence-upload-url";
import { getTask } from "./procedures/get";
import { listTasks } from "./procedures/list";
import { reviewTaskCompletion } from "./procedures/review-completion";
import { getTaskStats } from "./procedures/stats";
import {
	listUninstalledItems,
	reviewUninstalledItem,
} from "./procedures/uninstalled-items";
import { updateTask } from "./procedures/update";
import { getWorkloadByEmployee } from "./procedures/workload";

export const tasksRouter = {
	list: listTasks,
	get: getTask,
	create: createTask,
	update: updateTask,
	delete: deleteTask,
	assignEmployees: assignEmployees,
	stats: getTaskStats,
	completeWithEvidence: completeTaskWithEvidence,
	reviewCompletion: reviewTaskCompletion,
	createEvidenceUploadUrl,
	uninstalledItems: {
		list: listUninstalledItems,
		review: reviewUninstalledItem,
	},
	workload: getWorkloadByEmployee,
};
