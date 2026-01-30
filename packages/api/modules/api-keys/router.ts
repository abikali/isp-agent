import { createApiKey } from "./procedures/create";
import { listApiKeys } from "./procedures/list";
import { revokeApiKey } from "./procedures/revoke";

export const apiKeysRouter = {
	create: createApiKey,
	list: listApiKeys,
	revoke: revokeApiKey,
};
