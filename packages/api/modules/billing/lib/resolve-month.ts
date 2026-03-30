/**
 * Shared billing month resolution logic.
 *
 * The "active month" is the latest unlocked billing month for an organization.
 * When no unlocked month exists, the current calendar month is created.
 */

import { db } from "@repo/database";

/**
 * Resolve the billing month ID for a given year/month.
 * Returns undefined if no record exists yet.
 */
export async function resolveBillingMonthId(
	organizationId: string,
	year?: number,
	month?: number,
): Promise<string | undefined> {
	const now = new Date();
	const y = year ?? now.getFullYear();
	const m = month ?? now.getMonth() + 1;

	const billingMonth = await db.billingMonth.findUnique({
		where: {
			organizationId_year_month: { organizationId, year: y, month: m },
		},
		select: { id: true },
	});
	return billingMonth?.id;
}

/**
 * Resolve the active billing month: the latest unlocked month.
 * If no unlocked month exists, creates one for the current calendar month.
 */
export async function resolveActiveBillingMonth(organizationId: string) {
	// Find the latest unlocked month
	const activeMonth = await db.billingMonth.findFirst({
		where: { organizationId, locked: false },
		orderBy: [{ year: "desc" }, { month: "desc" }],
	});

	if (activeMonth) {
		return activeMonth;
	}

	// No unlocked month — create one for the current calendar month
	const now = new Date();
	return db.billingMonth.upsert({
		where: {
			organizationId_year_month: {
				organizationId,
				year: now.getFullYear(),
				month: now.getMonth() + 1,
			},
		},
		update: {},
		create: {
			organizationId,
			year: now.getFullYear(),
			month: now.getMonth() + 1,
		},
	});
}

/**
 * Resolve or create a billing month record for a specific year/month.
 */
export async function resolveOrCreateBillingMonth(
	organizationId: string,
	year?: number,
	month?: number,
) {
	const now = new Date();
	const y = year ?? now.getFullYear();
	const m = month ?? now.getMonth() + 1;

	return db.billingMonth.upsert({
		where: {
			organizationId_year_month: { organizationId, year: y, month: m },
		},
		update: {},
		create: { organizationId, year: y, month: m },
	});
}

/**
 * Resolve year/month from optional input, falling back to the active
 * billing month. Also returns the billingMonthId (avoids a second DB call
 * when the active month was used as the fallback).
 */
export async function resolveYearMonth(
	organizationId: string,
	inputYear?: number,
	inputMonth?: number,
): Promise<{
	year: number;
	month: number;
	billingMonthId?: string | undefined;
}> {
	if (inputYear != null && inputMonth != null) {
		const billingMonthId = await resolveBillingMonthId(
			organizationId,
			inputYear,
			inputMonth,
		);
		return { year: inputYear, month: inputMonth, billingMonthId };
	}
	const active = await resolveActiveBillingMonth(organizationId);
	return {
		year: inputYear ?? active.year,
		month: inputMonth ?? active.month,
		billingMonthId: active.id,
	};
}

/**
 * Derive a date range for a billing month.
 */
export function getMonthDateRange(year: number, month: number) {
	return {
		gte: new Date(year, month - 1, 1),
		lte: new Date(year, month, 0, 23, 59, 59, 999),
	};
}
