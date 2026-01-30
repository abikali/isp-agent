"use client";

import { useRouter as useTanStackRouter } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

export function useRouter() {
	const router = useTanStackRouter();

	const push = useCallback(
		(href: string) => {
			router.navigate({ to: href as "/" });
		},
		[router],
	);

	const replace = useCallback(
		(href: string) => {
			router.navigate({ to: href as "/", replace: true });
		},
		[router],
	);

	const refresh = useCallback(() => {
		router.invalidate();
	}, [router]);

	const back = useCallback(() => {
		router.history.back();
	}, [router]);

	return useMemo(
		() => ({
			...router,
			push,
			replace,
			refresh,
			back,
		}),
		[router, push, replace, refresh, back],
	);
}
