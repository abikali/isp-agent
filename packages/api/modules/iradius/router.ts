import { publicProcedure } from "../../orpc/procedures";
import { getIradiusHealth } from "./procedures/health";
import { getNasHealth } from "./procedures/nas-health";
import { getRecentSyncs } from "./procedures/recent-syncs";
import { getTopConsumers } from "./procedures/top-consumers";

export const iradiusRouter = publicProcedure.router({
	health: getIradiusHealth,
	nasHealth: getNasHealth,
	recentSyncs: getRecentSyncs,
	topConsumers: getTopConsumers,
});
