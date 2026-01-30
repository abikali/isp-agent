import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock @tanstack/react-router
vi.mock("@tanstack/react-router", () => ({
	Link: ({
		to,
		children,
		...props
	}: {
		to: string;
		children: React.ReactNode;
	}) => {
		const React = require("react");
		return React.createElement("a", { href: to, ...props }, children);
	},
	useRouter: () => ({
		navigate: vi.fn(),
	}),
	useLocation: () => ({
		pathname: "/",
	}),
	useSearch: () => ({}),
	useParams: () => ({}),
}));

// Mock shared router hook
vi.mock("@shared/hooks/router", () => ({
	useRouter: () => ({
		push: vi.fn(),
		replace: vi.fn(),
		back: vi.fn(),
		refresh: vi.fn(),
	}),
}));

// Mock theme store
vi.mock("@shared/stores/theme-store", () => ({
	themeStore: {
		state: { theme: "light", resolvedTheme: "light" },
		subscribe: vi.fn(),
	},
	setTheme: vi.fn(),
	useTheme: () => ({
		theme: "light",
		resolvedTheme: "light",
		setTheme: vi.fn(),
	}),
}));

// Mock organizations client for tests that need it
vi.mock("@saas/organizations/client", () => ({
	useActiveOrganization: () => ({
		activeOrganization: null,
		setActiveOrganization: vi.fn(),
	}),
	useOrganizations: () => ({
		organizations: [],
		isLoading: false,
	}),
}));
