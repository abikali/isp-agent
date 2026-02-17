import { assignEmployees } from "./procedures/assign-employees";
import { createTask } from "./procedures/create";
import { deleteTask } from "./procedures/delete";
import { getTask } from "./procedures/get";
import { listTasks } from "./procedures/list";
import { getTaskStats } from "./procedures/stats";
import { updateTask } from "./procedures/update";

export const tasksRouter = {
	list: listTasks,
	get: getTask,
	create: createTask,
	update: updateTask,
	delete: deleteTask,
	assignEmployees: assignEmployees,
	stats: getTaskStats,
};
