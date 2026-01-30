import { publicProcedure } from "../../orpc/procedures";
import { createWebhook } from "./procedures/create";
import { deleteWebhook } from "./procedures/delete";
import { listDeliveries } from "./procedures/deliveries";
import { listWebhooks } from "./procedures/list";
import { retryDelivery } from "./procedures/retry";
import { testWebhook } from "./procedures/test";
import { updateWebhook } from "./procedures/update";

export const webhooksRouter = publicProcedure.router({
	create: createWebhook,
	list: listWebhooks,
	update: updateWebhook,
	delete: deleteWebhook,
	listDeliveries,
	retryDelivery,
	test: testWebhook,
});
