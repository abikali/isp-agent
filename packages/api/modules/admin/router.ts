import { dealersRouter } from "../dealers/router";
import { findOrganization } from "./procedures/find-organization";
import { listOrganizations } from "./procedures/list-organizations";
import { listUsers } from "./procedures/list-users";
import { getSyncDealersStatus, syncDealers } from "./procedures/sync-dealers";

export const adminRouter = {
	users: {
		list: listUsers,
	},
	organizations: {
		list: listOrganizations,
		find: findOrganization,
	},
	dealers: {
		...dealersRouter,
		sync: syncDealers,
		syncStatus: getSyncDealersStatus,
	},
};
