/**
 * Shared types for SaaS features
 */

/**
 * Notification for the notification bell component
 */
export interface Notification {
	id: string;
	type: string;
	title: string;
	message: string;
	link: string | null;
	read: boolean;
	createdAt: Date;
}
