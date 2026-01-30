"use client";

import { initializeTheme } from "@shared/stores/theme-store";
import { type PropsWithChildren, useEffect } from "react";

/**
 * ThemeProvider initializes the theme system on mount.
 * Theme state is managed via the theme store (@shared/stores/theme-store).
 * Use useTheme() from @shared/hooks/use-theme to access theme state.
 */
export function ThemeProvider({ children }: PropsWithChildren) {
	useEffect(() => {
		initializeTheme();
	}, []);

	return <>{children}</>;
}
