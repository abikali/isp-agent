import { publicProcedure } from "../../orpc/procedures";
import { getDashboardTrends } from "./procedures/trends";

export const dashboardRouter = publicProcedure.router({
	trends: getDashboardTrends,
});
