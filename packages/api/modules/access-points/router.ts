import { createAccessPoint } from "./procedures/create";
import { deleteAccessPoint } from "./procedures/delete";
import { getAccessPoint } from "./procedures/get";
import { listAccessPoints } from "./procedures/list";
import { updateAccessPoint } from "./procedures/update";

export const accessPointsRouter = {
	list: listAccessPoints,
	get: getAccessPoint,
	create: createAccessPoint,
	update: updateAccessPoint,
	delete: deleteAccessPoint,
};
