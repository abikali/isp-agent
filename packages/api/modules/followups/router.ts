import { listFollowups } from "./procedures/list";
import {
	createFollowup,
	deleteFollowup,
	updateFollowup,
} from "./procedures/mutations";

export const followupsRouter = {
	list: listFollowups,
	create: createFollowup,
	update: updateFollowup,
	delete: deleteFollowup,
};
