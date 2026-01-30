import { publicProcedure } from "../../orpc/procedures";
import { createSession } from "./procedures/create-session";
import { deleteConnection } from "./procedures/delete-connection";
import { listConnections } from "./procedures/list-connections";
import { listSyncHistory } from "./procedures/list-sync-history";
import { saveConnection } from "./procedures/save-connection";
import { syncContacts } from "./procedures/sync-contacts";
import { updateConnection } from "./procedures/update-connection";

export const integrationsRouter = publicProcedure.router({
	createSession,
	saveConnection,
	listConnections,
	updateConnection,
	deleteConnection,
	syncContacts,
	listSyncHistory,
});
