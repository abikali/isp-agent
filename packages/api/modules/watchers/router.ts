import { create } from "./procedures/create";
import { deleteWatcher } from "./procedures/delete";
import { get } from "./procedures/get";
import { getStats } from "./procedures/get-stats";
import { list } from "./procedures/list";
import { listExecutions } from "./procedures/list-executions";
import { listMessagingChannels } from "./procedures/list-messaging-channels";
import { runNow } from "./procedures/run-now";
import { toggleEnabled } from "./procedures/toggle-enabled";
import { update } from "./procedures/update";

export const watchersRouter = {
	list,
	get,
	create,
	update,
	deleteWatcher,
	toggleEnabled,
	listExecutions,
	getStats,
	runNow,
	listMessagingChannels,
};
