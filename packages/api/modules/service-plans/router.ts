import { createServicePlan } from "./procedures/create";
import { deleteServicePlan } from "./procedures/delete";
import { getServicePlan } from "./procedures/get";
import { listServicePlans } from "./procedures/list";
import { updateServicePlan } from "./procedures/update";

export const servicePlansRouter = {
	list: listServicePlans,
	get: getServicePlan,
	create: createServicePlan,
	update: updateServicePlan,
	delete: deleteServicePlan,
};
