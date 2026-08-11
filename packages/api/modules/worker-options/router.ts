import { createWorkerOption } from "./procedures/create";
import { deleteWorkerOption } from "./procedures/delete";
import { listWorkerOptions } from "./procedures/list";
import { updateWorkerOption } from "./procedures/update";

export const workerOptionsRouter = {
	list: listWorkerOptions,
	create: createWorkerOption,
	update: updateWorkerOption,
	delete: deleteWorkerOption,
};
