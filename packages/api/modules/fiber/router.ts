import { setFiberAreaStatus } from "./procedures/areas";
import { listAtRiskCustomers } from "./procedures/defend";
import {
	addCustomersToFiberPipeline,
	createFiberLead,
	getFiberLead,
	getFiberLeadForCustomer,
	listFiberLeads,
	logFiberContact,
	updateFiberLead,
} from "./procedures/leads";
import { fiberOverview } from "./procedures/overview";
import { rescanFiberSignals } from "./procedures/rescan";

export const fiberRouter = {
	overview: fiberOverview,
	leads: {
		list: listFiberLeads,
		get: getFiberLead,
		forCustomer: getFiberLeadForCustomer,
		create: createFiberLead,
		update: updateFiberLead,
		log: logFiberContact,
		addCustomers: addCustomersToFiberPipeline,
	},
	atRisk: listAtRiskCustomers,
	areas: { setStatus: setFiberAreaStatus },
	rescan: rescanFiberSignals,
};
