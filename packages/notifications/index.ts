// Legacy create functions (direct DB insert without preferences check)
export {
	createBulkNotifications,
	createNotification,
	createOrganizationNotification,
	type NotificationType,
} from "./src/create";

// New notification service (checks preferences, sends in-app + email)
export {
	type NotificationCategory,
	type NotificationPayload,
	sendBulkNotification,
	sendNotification,
	sendOrganizationNotification,
} from "./src/service";

// Notification trigger functions
export {
	notifyAccountLocked,
	notifyInvitationAccepted,
	notifyMemberJoined,
	notifyMemberLeft,
	notifyNewDeviceLogin,
} from "./src/triggers";
