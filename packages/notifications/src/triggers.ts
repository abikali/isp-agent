import { getBaseUrl } from "@repo/utils";
import { sendNotification, sendOrganizationNotification } from "./service";

const appUrl = getBaseUrl();

// ============================================================================
// TEAM NOTIFICATIONS
// ============================================================================

interface NotifyMemberJoinedParams {
	organizationId: string;
	organizationName: string;
	newMemberName: string;
	newMemberUserId: string;
	organizationSlug: string;
}

/**
 * Notify organization members when a new member joins
 */
export async function notifyMemberJoined(
	params: NotifyMemberJoinedParams,
): Promise<void> {
	const {
		organizationId,
		organizationName,
		newMemberName,
		newMemberUserId,
		organizationSlug,
	} = params;

	await sendOrganizationNotification(
		organizationId,
		{
			category: "team",
			type: "info",
			title: "New Team Member",
			message: `${newMemberName} has joined ${organizationName}`,
			link: `/app/${organizationSlug}/settings/members`,
			emailTemplateId: "memberJoined",
			emailContext: {
				memberName: newMemberName,
				organizationName,
				viewUrl: `${appUrl}/app/${organizationSlug}/settings/members`,
			},
		},
		[newMemberUserId], // Exclude the new member from receiving this notification
	);
}

interface NotifyMemberLeftParams {
	organizationId: string;
	organizationName: string;
	memberName: string;
	organizationSlug: string;
}

/**
 * Notify organization members when a member leaves
 */
export async function notifyMemberLeft(
	params: NotifyMemberLeftParams,
): Promise<void> {
	const { organizationId, organizationName, memberName, organizationSlug } =
		params;

	await sendOrganizationNotification(organizationId, {
		category: "team",
		type: "info",
		title: "Team Member Left",
		message: `${memberName} has left ${organizationName}`,
		link: `/app/${organizationSlug}/settings/members`,
	});
}

interface NotifyInvitationAcceptedParams {
	inviterId: string;
	newMemberName: string;
	organizationName: string;
	organizationSlug: string;
}

/**
 * Notify the inviter when their invitation is accepted
 */
export async function notifyInvitationAccepted(
	params: NotifyInvitationAcceptedParams,
): Promise<void> {
	const { inviterId, newMemberName, organizationName, organizationSlug } =
		params;

	await sendNotification({
		userId: inviterId,
		category: "team",
		type: "success",
		title: "Invitation Accepted",
		message: `${newMemberName} accepted your invitation to ${organizationName}`,
		link: `/app/${organizationSlug}/settings/members`,
	});
}

// ============================================================================
// SECURITY NOTIFICATIONS
// ============================================================================

interface NotifyNewDeviceLoginParams {
	userId: string;
	deviceName: string;
	ipAddress?: string;
	timestamp: Date;
}

/**
 * Notify user when a login is detected from a new device
 */
export async function notifyNewDeviceLogin(
	params: NotifyNewDeviceLoginParams,
): Promise<void> {
	const { userId, deviceName, ipAddress, timestamp } = params;

	const ipInfo = ipAddress ? ` (IP: ${ipAddress})` : "";

	await sendNotification({
		userId,
		category: "security",
		type: "warning",
		title: "New Device Login",
		message: `Login detected from ${deviceName}${ipInfo}`,
		link: "/app/settings/security",
		emailSubject: "New Device Login Detected - LibanCom",
		emailHtml: `
			<h2>New Device Login Detected</h2>
			<p>We detected a login to your account from a new device.</p>
			<p><strong>Device:</strong> ${deviceName}</p>
			${ipAddress ? `<p><strong>IP Address:</strong> ${ipAddress}</p>` : ""}
			<p><strong>Time:</strong> ${timestamp.toLocaleString()}</p>
			<p>If this wasn't you, please change your password immediately.</p>
			<p><a href="${appUrl}/app/settings/security">Review Security Settings</a></p>
		`,
	});
}

interface NotifyAccountLockedParams {
	userId: string;
	unlocksAt: Date;
	reason: string;
}

/**
 * Notify user when their account is locked
 */
export async function notifyAccountLocked(
	params: NotifyAccountLockedParams,
): Promise<void> {
	const { userId, unlocksAt, reason } = params;

	await sendNotification({
		userId,
		category: "security",
		type: "error",
		title: "Account Temporarily Locked",
		message: `Your account has been locked due to ${reason}. It will unlock at ${unlocksAt.toLocaleString()}.`,
		link: "/app/settings/security",
		emailSubject: "Account Temporarily Locked - LibanCom",
		emailHtml: `
			<h2>Account Security Alert</h2>
			<p>Your account has been temporarily locked due to: <strong>${reason}</strong></p>
			<p>Your account will be automatically unlocked at: <strong>${unlocksAt.toLocaleString()}</strong></p>
			<p>If you did not attempt to log in, please contact support immediately.</p>
		`,
	});
}
