import { getAccessPoint } from "./procedures/get";
import { listAccessPoints } from "./procedures/list";

export const accessPointsRouter = {
	list: listAccessPoints,
	get: getAccessPoint,
};
