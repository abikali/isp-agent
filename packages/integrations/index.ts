/**
 * @repo/integrations
 *
 * Shared integration utilities for connecting to third-party services.
 * This package provides a centralized Nango client that supports both
 * Nango Cloud and self-hosted instances.
 */

export {
	getNangoClient,
	getNangoHost,
	isNangoConfigured,
	resetNangoClient,
} from "./src/nango";
export type {
	SaltiClient,
	SaltiClientConfig,
	SaltiContact,
	SaltiGroup,
	SaltiMakeContactInput,
	SaltiSendResult,
	SaltiSendTemplateInput,
	SaltiTemplate,
	SaltiTemplateButton,
	SaltiTemplateComponent,
} from "./src/salti";
export { createSaltiClient, SaltiApiError } from "./src/salti";
