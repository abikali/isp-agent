"use client";

import { useRouterState } from "@tanstack/react-router";
import nProgress from "nprogress";
import { useEffect } from "react";

/**
 * Global navigation progress indicator using NProgress.
 * Uses TanStack Router's built-in isLoading state.
 */
export function NavigationProgress() {
	const isLoading = useRouterState({ select: (s) => s.isLoading });

	useEffect(() => {
		if (isLoading) {
			nProgress.start();
		} else {
			nProgress.done();
		}
	}, [isLoading]);

	return null;
}
