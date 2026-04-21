import { getStation } from "./procedures/get";
import { listStations } from "./procedures/list";

export const stationsRouter = {
	list: listStations,
	get: getStation,
};
