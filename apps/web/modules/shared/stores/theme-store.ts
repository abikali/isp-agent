import { Store } from "@tanstack/store";

type Theme = "light" | "dark" | "system";

export interface ThemeState {
	theme: Theme;
	resolvedTheme: "light" | "dark";
}

function getSystemTheme(): "light" | "dark" {
	if (typeof window === "undefined") {
		return "light";
	}
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

function getInitialTheme(): Theme {
	if (typeof window === "undefined") {
		return "system";
	}
	return (localStorage.getItem("theme") as Theme) || "system";
}

function getInitialResolvedTheme(): "light" | "dark" {
	const theme = getInitialTheme();
	if (theme === "system") {
		return getSystemTheme();
	}
	return theme;
}

export const themeStore = new Store<ThemeState>({
	theme: typeof window === "undefined" ? "system" : getInitialTheme(),
	resolvedTheme:
		typeof window === "undefined" ? "light" : getInitialResolvedTheme(),
});

function updateDocumentClass(resolvedTheme: "light" | "dark") {
	if (typeof document === "undefined") {
		return;
	}
	document.documentElement.classList.remove("light", "dark");
	document.documentElement.classList.add(resolvedTheme);
}

export function setTheme(theme: Theme) {
	const resolvedTheme = theme === "system" ? getSystemTheme() : theme;

	themeStore.setState(() => ({
		theme,
		resolvedTheme,
	}));

	if (typeof window !== "undefined") {
		localStorage.setItem("theme", theme);
		updateDocumentClass(resolvedTheme);
	}
}

export function initializeTheme() {
	if (typeof window === "undefined") {
		return;
	}

	const savedTheme = (localStorage.getItem("theme") as Theme) || "system";
	const resolvedTheme =
		savedTheme === "system" ? getSystemTheme() : savedTheme;

	themeStore.setState(() => ({
		theme: savedTheme,
		resolvedTheme,
	}));

	updateDocumentClass(resolvedTheme);

	// Listen for system theme changes
	const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
	mediaQuery.addEventListener("change", (e) => {
		if (themeStore.state.theme === "system") {
			const newResolvedTheme = e.matches ? "dark" : "light";
			themeStore.setState((prev: ThemeState) => ({
				...prev,
				resolvedTheme: newResolvedTheme,
			}));
			updateDocumentClass(newResolvedTheme);
		}
	});
}

// Script to inject in <head> to prevent flash of wrong theme
// Empty catch: silently fall back to default if localStorage unavailable (private mode, etc.)
export const themeScript = `
(function() {
  try {
    var theme = localStorage.getItem('theme') || 'system';
    var resolvedTheme = theme;
    if (theme === 'system') {
      resolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.classList.add(resolvedTheme);
  } catch (e) {}
})();
`;
