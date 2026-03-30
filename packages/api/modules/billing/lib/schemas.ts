/**
 * Shared Zod schemas for billing procedure inputs.
 * Eliminates copy-pasted validation fragments across procedures.
 */

import z from "zod";

/** Pagination fields with configurable default pageSize. */
export function paginationSchema(defaultPageSize = 25) {
	return z.object({
		page: z.number().int().min(1).default(1),
		pageSize: z.number().int().min(10).max(100).default(defaultPageSize),
	});
}

/** Optional year/month specifier for billing month selection. */
export const monthSpecSchema = z.object({
	year: z.number().int().optional(),
	month: z.number().int().min(1).max(12).optional(),
});

/** Optional date range filter. */
export const dateRangeSchema = z.object({
	dateFrom: z.string().optional(),
	dateTo: z.string().optional(),
});
