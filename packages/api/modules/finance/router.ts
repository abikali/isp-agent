import { getFinanceBreakdown } from "./procedures/breakdown";
import {
	getMoneyMap,
	listFinanceCategories,
	saveMoneyMap,
} from "./procedures/money-map";
import { refreshFinance } from "./procedures/refresh";
import { getFinanceSummary } from "./procedures/summary";
import { getFinanceTrend } from "./procedures/trend";

export const financeRouter = {
	summary: getFinanceSummary,
	breakdown: getFinanceBreakdown,
	trend: getFinanceTrend,
	refresh: refreshFinance,
	categories: {
		list: listFinanceCategories,
	},
	moneyMap: {
		get: getMoneyMap,
		save: saveMoneyMap,
	},
};
