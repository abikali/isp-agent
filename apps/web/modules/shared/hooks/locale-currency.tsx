"use client";

import { config } from "@repo/config";

export function useLocaleCurrency() {
	// Default to USD since app is now English-only
	const localeCurrency = config.i18n.defaultCurrency;

	return localeCurrency;
}
