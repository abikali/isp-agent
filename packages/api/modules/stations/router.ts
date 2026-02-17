import { createStation } from "./procedures/create";
import { deleteStation } from "./procedures/delete";
import { getStation } from "./procedures/get";
import { listStations } from "./procedures/list";
import { updateStation } from "./procedures/update";

export const stationsRouter = {
	list: listStations,
	get: getStation,
	create: createStation,
	update: updateStation,
	delete: deleteStation,
};
