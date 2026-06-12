import { getAddonDefaults } from "./procedures/addon-defaults";
import { createInstallation } from "./procedures/create";
import { listInstallations } from "./procedures/list";
import {
	approveInstallations,
	denyInstallation,
	updatePendingInstallation,
} from "./procedures/review";
import { getInstallationStats } from "./procedures/stats";

export const installationsRouter = {
	list: listInstallations,
	create: createInstallation,
	updatePending: updatePendingInstallation,
	approve: approveInstallations,
	deny: denyInstallation,
	stats: getInstallationStats,
	addonDefaults: getAddonDefaults,
};
