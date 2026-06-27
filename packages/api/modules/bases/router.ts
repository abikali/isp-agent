import { createBase } from "./procedures/create";
import { deleteBase } from "./procedures/delete";
import { getBase } from "./procedures/get";
import { listBases } from "./procedures/list";
import { updateBase } from "./procedures/update";

export const basesRouter = {
	list: listBases,
	get: getBase,
	create: createBase,
	update: updateBase,
	delete: deleteBase,
};
