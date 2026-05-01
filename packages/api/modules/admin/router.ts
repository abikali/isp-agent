import { dealersRouter } from "../dealers/router";
import { createOrganizationOwner } from "./procedures/create-org-owner";
import { findOrganization } from "./procedures/find-organization";
import { listOrganizations } from "./procedures/list-organizations";
import { listUsers } from "./procedures/list-users";
import { setOrganizationIradiusDisabled } from "./procedures/set-organization-iradius-disabled";
import { getSyncDealersStatus, syncDealers } from "./procedures/sync-dealers";

export const adminRouter = {
	users: {
		list: listUsers,
	},
	organizations: {
		list: listOrganizations,
		find: findOrganization,
		setIradiusDisabled: setOrganizationIradiusDisabled,
		createOwner: createOrganizationOwner,
	},
	dealers: {
		...dealersRouter,
		sync: syncDealers,
		syncStatus: getSyncDealersStatus,
	},
};
