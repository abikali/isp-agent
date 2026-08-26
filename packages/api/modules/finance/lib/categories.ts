/**
 * The default money map.
 *
 * Seeded once per organization, in the owner's own words. These are the
 * buckets that appear in the setup wizard and on every cost breakdown.
 *
 * Naming rule: an owner who has never seen an accounting screen must be able
 * to pick the right bucket without asking anyone. That rules out "COGS",
 * "OPEX", "capital expenditure", and "drawings". It rules in "Internet we buy",
 * "Staff pay", and "My own money".
 */

import type { FinanceKind } from "@repo/database/enums";

export interface SeedCategory {
	key: string;
	kind: FinanceKind;
	label: string;
	labelAr: string;
	hint: string;
	sortOrder: number;
}

export const DEFAULT_CATEGORIES: SeedCategory[] = [
	{
		key: "network",
		kind: "COST",
		label: "Internet we buy",
		labelAr: "الإنترنت اللي منشتريه",
		hint: "Bandwidth from your upstream provider. Usually your biggest cost.",
		sortOrder: 10,
	},
	{
		key: "staff",
		kind: "COST",
		label: "Staff pay",
		labelAr: "معاشات الموظفين",
		hint: "Salaries, advances and anything you hand a worker as wages.",
		sortOrder: 20,
	},
	{
		key: "equipment",
		kind: "COST",
		label: "Equipment & parts",
		labelAr: "معدات وقطع",
		hint: "Routers, cable, antennas, tools — anything installed or consumed.",
		sortOrder: 30,
	},
	{
		key: "premises",
		kind: "COST",
		label: "Rent & office",
		labelAr: "إيجار ومكتب",
		hint: "Office and rooftop rent, electricity, water, generator.",
		sortOrder: 40,
	},
	{
		key: "vehicles",
		kind: "COST",
		label: "Vehicles & fuel",
		labelAr: "سيارات ومحروقات",
		hint: "Fuel, repairs, registration for the team's vehicles.",
		sortOrder: 50,
	},
	{
		key: "official",
		kind: "COST",
		label: "Government & fees",
		labelAr: "رسوم ودوائر رسمية",
		hint: "Municipality, permits, work papers, accountant, bank charges.",
		sortOrder: 60,
	},
	{
		key: "other-cost",
		kind: "COST",
		label: "Other running costs",
		labelAr: "مصاريف أخرى",
		hint: "Anything that keeps the business running and fits nowhere above.",
		sortOrder: 70,
	},
	{
		key: "owner-draw",
		kind: "DRAW",
		label: "My own money",
		labelAr: "مصاري الشركاء",
		hint: "What you or a partner take out. Not a business cost — shown separately so you can still see whether the business itself makes money.",
		sortOrder: 80,
	},
];

/** The bucket a cost falls into when nobody has classified it yet. Deliberately
 *  NOT one of the real buckets — an unclassified cost should look unclassified
 *  on the report, so it gets fixed rather than quietly distorting a total. */
export const UNCLASSIFIED_LABEL = "Not sorted yet";
