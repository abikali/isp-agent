/**
 * Frontend types for admin feature
 */

/**
 * Feature flag configuration
 */
export interface FeatureFlag {
	id: string;
	key: string;
	name: string;
	description: string | null;
	enabled: boolean;
	percentage: number;
	targetUsers: string[];
	targetOrgs: string[];
	createdAt: Date;
	updatedAt: Date;
}
