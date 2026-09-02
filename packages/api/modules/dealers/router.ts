import { adjustDealerCredit } from "./procedures/adjust-credit";
import { createDealer } from "./procedures/create";
import { deleteDealer } from "./procedures/delete";
import { getDealerFinanceLedger } from "./procedures/finance-ledger";
import { getDealerFinanceOverview } from "./procedures/finance-overview";
import {
	getDealerFinanceSyncStatus,
	syncDealerFinanceNow,
} from "./procedures/finance-sync";
import { getDealer } from "./procedures/get";
import { getDealerLedger } from "./procedures/ledger";
import { listDealers } from "./procedures/list";
import { recordDealerPayment } from "./procedures/record-payment";
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

/**
 * Organization-facing dealer money: mounted at the top level as `dealers.*`.
 * Scoped per organization (operator sees every dealer, a reseller only
 * itself); the admin router above is the platform-wide raw view.
 */
export const dealerFinanceRouter = {
	overview: getDealerFinanceOverview,
	ledger: getDealerFinanceLedger,
	adjustCredit: adjustDealerCredit,
	recordPayment: recordDealerPayment,
	syncNow: syncDealerFinanceNow,
	syncStatus: getDealerFinanceSyncStatus,
};
