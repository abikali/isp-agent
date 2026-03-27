import { createDealer } from "./procedures/create";
import { deleteDealer } from "./procedures/delete";
import { getDealer } from "./procedures/get";
import { listDealers } from "./procedures/list";
import { getDealerStats } from "./procedures/stats";
import { updateDealer } from "./procedures/update";

export const dealersRouter = {
	list: listDealers,
	get: getDealer,
	create: createDealer,
	update: updateDealer,
	delete: deleteDealer,
	stats: getDealerStats,
};
