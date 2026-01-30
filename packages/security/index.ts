// Failed Login Tracking

// Account Lockout
export {
	getLockedAccounts,
	isAccountLocked,
	lockAccount,
	shouldLockAccount,
	unlockAccount,
} from "./src/account-lockout";
// Device Tracking
export {
	generateDeviceFingerprint,
	getUserDevices,
	handleDeviceLogin,
	isKnownDevice,
	parseDeviceName,
	registerDevice,
	removeDevice,
	sendNewDeviceNotification,
} from "./src/device-tracking";
export {
	applyProgressiveDelay,
	calculateProgressiveDelay,
	clearFailedAttempts,
	getLoginHistory,
	getRecentFailedAttempts,
	recordLoginAttempt,
} from "./src/failed-login";

// Types
export type {
	DeviceInfo,
	LockoutInfo,
	LockoutReason,
	LoginAttemptInfo,
	LoginFailureReason,
} from "./src/types";
