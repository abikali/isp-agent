import { createDealer } from "./procedures/create";
import { deleteDealer } from "./procedures/delete";
import { getDealer } from "./procedures/get";
import { getDealerLedger } from "./procedures/ledger";
import { listDealers } from "./procedures/list";
import { setActiveDealer } from "./procedures/set-active";
import { getDealerStats } from "./procedures/stats";
import { updateDealer } from "./procedures/update";

export const dealersRouter = {
	list: listDealers,
	get: getDealer,
	create: createDealer,
	update: updateDealer,
	delete: deleteDealer,
	stats: getDealerStats,
	setActive: setActiveDealer,
	ledger: getDealerLedger,
};
