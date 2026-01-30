/**
 * Webhook event type definitions
 */

export const WEBHOOK_EVENTS = {
	// User events
	"user.created": "user.created",
	"user.updated": "user.updated",
	"user.deleted": "user.deleted",

	// Organization events
	"organization.created": "organization.created",
	"organization.updated": "organization.updated",
	"organization.deleted": "organization.deleted",

	// Member events
	"member.invited": "member.invited",
	"member.joined": "member.joined",
	"member.removed": "member.removed",
	"member.role_changed": "member.role_changed",

	// Subscription/Payment events
	"subscription.created": "subscription.created",
	"subscription.updated": "subscription.updated",
	"subscription.canceled": "subscription.canceled",
	"payment.completed": "payment.completed",
	"payment.failed": "payment.failed",
} as const;

export type WebhookEvent = keyof typeof WEBHOOK_EVENTS;

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
	"user.created": "User Created",
	"user.updated": "User Updated",
	"user.deleted": "User Deleted",
	"organization.created": "Organization Created",
	"organization.updated": "Organization Updated",
	"organization.deleted": "Organization Deleted",
	"member.invited": "Member Invited",
	"member.joined": "Member Joined",
	"member.removed": "Member Removed",
	"member.role_changed": "Member Role Changed",
	"subscription.created": "Subscription Created",
	"subscription.updated": "Subscription Updated",
	"subscription.canceled": "Subscription Canceled",
	"payment.completed": "Payment Completed",
	"payment.failed": "Payment Failed",
};

export const WEBHOOK_EVENT_CATEGORIES = {
	user: ["user.created", "user.updated", "user.deleted"],
	organization: [
		"organization.created",
		"organization.updated",
		"organization.deleted",
	],
	member: [
		"member.invited",
		"member.joined",
		"member.removed",
		"member.role_changed",
	],
	payment: [
		"subscription.created",
		"subscription.updated",
		"subscription.canceled",
		"payment.completed",
		"payment.failed",
	],
} as const;

export interface WebhookPayload<T = unknown> {
	id: string;
	event: WebhookEvent;
	timestamp: string;
	data: T;
}
