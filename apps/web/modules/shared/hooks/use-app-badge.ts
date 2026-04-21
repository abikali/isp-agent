"use client";

import { useEffect } from "react";

interface BadgingNavigator {
	setAppBadge?: (count?: number) => Promise<void>;
	clearAppBadge?: () => Promise<void>;
}

export function useAppBadge(count: number | undefined) {
	useEffect(() => {
		const nav = navigator as unknown as BadgingNavigator;
		if (!nav.setAppBadge || !nav.clearAppBadge) {
			return;
		}
		if (count && count > 0) {
			nav.setAppBadge(count).catch(() => {});
		} else {
			nav.clearAppBadge().catch(() => {});
		}
	}, [count]);
}
