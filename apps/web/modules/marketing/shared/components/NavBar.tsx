"use client";

import { config } from "@repo/config";
import { useSession } from "@saas/auth/client";
import { ColorModeToggle } from "@shared/components/ColorModeToggle";
import { Logo } from "@shared/components/Logo";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import { Link, useLocation } from "@tanstack/react-router";
import { Button } from "@ui/components/button";
import {
	Sheet,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from "@ui/components/sheet";
import { cn } from "@ui/lib";
import { MenuIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface MenuItem {
	label: string;
	href: string;
	isAnchor?: boolean;
}

export function NavBar() {
	const { user } = useSession();
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const location = useLocation();
	const pathname = location.pathname;
	const [isTop, setIsTop] = useState(true);
	const [activeSection, setActiveSection] = useState<string>("");

	const handleMobileMenuClose = () => {
		setMobileMenuOpen(false);
	};

	const debouncedScrollHandler = useDebouncedCallback(
		() => {
			setIsTop(window.scrollY <= 10);
		},
		{ wait: 150 },
	);

	// Smooth scroll to section
	const scrollToSection = useCallback(
		(e: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
			e.preventDefault();
			const element = document.getElementById(sectionId);
			if (element) {
				const navHeight = 80;
				const elementPosition = element.getBoundingClientRect().top;
				const offsetPosition =
					elementPosition + window.scrollY - navHeight;

				window.scrollTo({
					top: offsetPosition,
					behavior: "smooth",
				});

				// Update URL hash without jumping
				window.history.pushState(null, "", `#${sectionId}`);
			}
			setMobileMenuOpen(false);
		},
		[],
	);

	// Track active section on scroll
	useEffect(() => {
		if (pathname !== "/") {
			return;
		}

		const sections = ["features", "how-it-works", "pricing", "faq"];
		const observerOptions = {
			rootMargin: "-20% 0px -60% 0px",
			threshold: 0,
		};

		const observer = new IntersectionObserver((entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					setActiveSection(entry.target.id);
				}
			}
		}, observerOptions);

		for (const sectionId of sections) {
			const element = document.getElementById(sectionId);
			if (element) {
				observer.observe(element);
			}
		}

		return () => observer.disconnect();
	}, [pathname]);

	useEffect(() => {
		window.addEventListener("scroll", debouncedScrollHandler);
		debouncedScrollHandler();
		return () => {
			window.removeEventListener("scroll", debouncedScrollHandler);
		};
	}, [debouncedScrollHandler]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally close mobile menu on route change only
	useEffect(() => {
		setMobileMenuOpen(false);
	}, [pathname]);

	const isDocsPage = pathname.startsWith("/docs");

	const menuItems: MenuItem[] = [
		{
			label: "Features",
			href: "#features",
			isAnchor: true,
		},
		{
			label: "How it Works",
			href: "#how-it-works",
			isAnchor: true,
		},
		{
			label: "Pricing",
			href: "#pricing",
			isAnchor: true,
		},
		{
			label: "FAQ",
			href: "#faq",
			isAnchor: true,
		},
	];

	const isMenuItemActive = (item: MenuItem) => {
		if (item.isAnchor) {
			const sectionId = item.href.replace("#", "");
			return pathname === "/" && activeSection === sectionId;
		}
		return pathname.startsWith(item.href);
	};

	return (
		<nav
			className={cn(
				"fixed left-0 top-0 z-50 w-full transition-all duration-200",
				!isTop || isDocsPage
					? "border-b border-border/50 bg-background/80 backdrop-blur-sm"
					: "",
			)}
			data-test="navigation"
		>
			<div className="container">
				<div
					className={cn(
						"flex items-center justify-stretch gap-6 transition-[padding] duration-200",
						!isTop || isDocsPage ? "py-4" : "py-6",
					)}
				>
					<div className="flex flex-1 justify-start">
						<Link
							to="/"
							className="block hover:no-underline active:no-underline"
						>
							<Logo />
						</Link>
					</div>

					<div className="hidden flex-1 items-center justify-center lg:flex">
						{menuItems.map((menuItem) =>
							menuItem.isAnchor ? (
								<a
									key={menuItem.href}
									href={menuItem.href}
									onClick={(e) =>
										scrollToSection(
											e,
											menuItem.href.replace("#", ""),
										)
									}
									className={cn(
										"relative block px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
										isMenuItemActive(menuItem) &&
											"font-semibold text-foreground",
									)}
								>
									{menuItem.label}
								</a>
							) : (
								<Link
									key={menuItem.href}
									to={menuItem.href}
									className={cn(
										"relative block px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
										isMenuItemActive(menuItem) &&
											"font-semibold text-foreground",
									)}
									preload="intent"
								>
									{menuItem.label}
								</Link>
							),
						)}
					</div>

					<div className="flex flex-1 items-center justify-end gap-3">
						<ColorModeToggle />

						<Sheet
							open={mobileMenuOpen}
							onOpenChange={(open) => setMobileMenuOpen(open)}
						>
							<SheetTrigger asChild>
								<Button
									className="lg:hidden"
									size="icon"
									variant="ghost"
									aria-label="Menu"
								>
									<MenuIcon className="size-4" />
								</Button>
							</SheetTrigger>
							<SheetContent
								className="w-[85vw] max-w-[280px]"
								side="right"
							>
								<SheetTitle />
								<div className="flex flex-col items-start justify-center gap-1 pt-4">
									{menuItems.map((menuItem) =>
										menuItem.isAnchor ? (
											<a
												key={menuItem.href}
												href={menuItem.href}
												onClick={(e) =>
													scrollToSection(
														e,
														menuItem.href.replace(
															"#",
															"",
														),
													)
												}
												className={cn(
													"block w-full rounded-md px-3 py-2 text-base text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
													isMenuItemActive(
														menuItem,
													) &&
														"font-semibold text-foreground",
												)}
											>
												{menuItem.label}
											</a>
										) : (
											<Link
												key={menuItem.href}
												to={menuItem.href}
												onClick={handleMobileMenuClose}
												className={cn(
													"block w-full rounded-md px-3 py-2 text-base text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
													isMenuItemActive(
														menuItem,
													) &&
														"font-semibold text-foreground",
												)}
												preload="intent"
											>
												{menuItem.label}
											</Link>
										),
									)}

									<Link
										key={user ? "start" : "login"}
										to={user ? "/app" : "/login"}
										className="block w-full rounded-md px-3 py-2 text-base text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
										onClick={handleMobileMenuClose}
										preload={!user ? "intent" : false}
									>
										{user ? "Dashboard" : "Login"}
									</Link>
								</div>
							</SheetContent>
						</Sheet>

						{config.ui.saas.enabled &&
							(user ? (
								<Button
									key="dashboard"
									className="hidden lg:flex"
									asChild
									variant="primary"
								>
									<Link to="/app">Dashboard</Link>
								</Button>
							) : (
								<Button
									key="login"
									className="hidden lg:flex"
									asChild
									variant="primary"
								>
									<Link to="/login" preload="intent">
										Login
									</Link>
								</Button>
							))}
					</div>
				</div>
			</div>
		</nav>
	);
}
