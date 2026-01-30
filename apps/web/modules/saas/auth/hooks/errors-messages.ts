import type { AuthClientErrorCodes } from "@repo/auth/client";

/**
 * Custom OAuth error codes not in Better Auth's default error codes
 */
type OAuthErrorCodes =
	| "OAUTH_ACCESS_DENIED"
	| "OAUTH_ACCOUNT_ALREADY_LINKED"
	| "OAUTH_CALLBACK_ERROR"
	| "STATE_NOT_FOUND"
	| "INVALID_CALLBACK_REQUEST";

/**
 * Auth error messages map - includes both Better Auth and custom OAuth error codes
 */
export const AUTH_ERROR_MESSAGES: Partial<
	Record<keyof AuthClientErrorCodes | OAuthErrorCodes, string>
> = {
	INVALID_EMAIL_OR_PASSWORD: "Invalid email or password",
	USER_NOT_FOUND: "User not found",
	FAILED_TO_CREATE_USER: "Failed to create user",
	FAILED_TO_CREATE_SESSION: "Failed to create session",
	FAILED_TO_UPDATE_USER: "Failed to update user",
	FAILED_TO_GET_SESSION: "Failed to get session",
	INVALID_PASSWORD: "Invalid password",
	INVALID_EMAIL: "Invalid email",
	INVALID_TOKEN: "Invalid token",
	CREDENTIAL_ACCOUNT_NOT_FOUND: "Credential account not found",
	EMAIL_CAN_NOT_BE_UPDATED: "Email cannot be updated",
	EMAIL_NOT_VERIFIED: "Email not verified",
	FAILED_TO_GET_USER_INFO: "Failed to get user info",
	ID_TOKEN_NOT_SUPPORTED: "ID token not supported",
	PASSWORD_TOO_LONG: "Password too long",
	PASSWORD_TOO_SHORT: "Password too short",
	PROVIDER_NOT_FOUND: "Provider not found",
	SOCIAL_ACCOUNT_ALREADY_LINKED: "Social account already linked",
	USER_EMAIL_NOT_FOUND: "User email not found",
	USER_ALREADY_EXISTS: "User already exists",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"An account with this email already exists",
	INVALID_INVITATION: "Invalid invitation",
	SESSION_EXPIRED: "Session expired",
	FAILED_TO_UNLINK_LAST_ACCOUNT: "Failed to unlink last account",
	ACCOUNT_NOT_FOUND: "Account not found",
	// OAuth-specific errors
	OAUTH_ACCESS_DENIED:
		"Access was denied. Please allow the required permissions.",
	OAUTH_ACCOUNT_ALREADY_LINKED:
		"This Google account is already linked to another user.",
	OAUTH_CALLBACK_ERROR: "Authentication failed. Please try again.",
	STATE_NOT_FOUND: "Security validation failed. Please try signing in again.",
	INVALID_CALLBACK_REQUEST:
		"Invalid authentication response. Please try again.",
};

/**
 * Get user-friendly auth error message
 */
export function getAuthErrorMessage(errorCode: string | undefined): string {
	return (
		AUTH_ERROR_MESSAGES[errorCode as keyof typeof AUTH_ERROR_MESSAGES] ||
		"An unknown error occurred"
	);
}
