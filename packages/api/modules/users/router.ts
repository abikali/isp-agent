import { createAvatarUploadUrl } from "./procedures/create-avatar-upload-url";
import {
	cancelAccountDeletion,
	getAccountDeletionStatus,
	requestAccountDeletion,
} from "./procedures/delete-account";
import { exportUserData } from "./procedures/export-data";

export const usersRouter = {
	avatarUploadUrl: createAvatarUploadUrl,
	exportData: exportUserData,
	requestDeletion: requestAccountDeletion,
	cancelDeletion: cancelAccountDeletion,
	deletionStatus: getAccountDeletionStatus,
};
