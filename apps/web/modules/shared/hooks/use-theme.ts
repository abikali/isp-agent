"use client";

import { setTheme, themeStore } from "@shared/stores/theme-store";
import { useStore } from "@tanstack/react-store";

export function useTheme() {
	const theme = useStore(themeStore, (state) => state.theme);
	const resolvedTheme = useStore(themeStore, (state) => state.resolvedTheme);

	return {
		theme,
		resolvedTheme,
		setTheme,
	};
}
