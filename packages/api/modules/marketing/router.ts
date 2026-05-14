import { cancelBroadcast } from "./procedures/cancel-broadcast";
import { createAssetUploadUrl } from "./procedures/create-asset-upload-url";
import { createBroadcast } from "./procedures/create-broadcast";
import { deleteBroadcast } from "./procedures/delete-broadcast";
import { deleteIntegration } from "./procedures/delete-integration";
import { getBroadcast } from "./procedures/get-broadcast";
import { getIntegration } from "./procedures/get-integration";
import { listBroadcasts } from "./procedures/list-broadcasts";
import { listGroups } from "./procedures/list-groups";
import { listTemplates } from "./procedures/list-templates";
import { previewAudience } from "./procedures/preview-audience";
import { resendBroadcast } from "./procedures/resend-broadcast";
import { testConnection } from "./procedures/test-connection";
import { updateBroadcast } from "./procedures/update-broadcast";
import { upsertIntegration } from "./procedures/upsert-integration";

export const marketingRouter = {
	getIntegration,
	upsertIntegration,
	deleteIntegration,
	testConnection,
	listTemplates,
	listGroups,
	previewAudience,
	createBroadcast,
	updateBroadcast,
	deleteBroadcast,
	resendBroadcast,
	listBroadcasts,
	getBroadcast,
	cancelBroadcast,
	createAssetUploadUrl,
};
