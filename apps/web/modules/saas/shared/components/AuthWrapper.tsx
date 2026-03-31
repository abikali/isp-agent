"use client";

import { ColorModeToggle } from "@shared/components/ColorModeToggle";
import { Logo } from "@shared/components/Logo";
import { Link } from "@tanstack/react-router";
import { cn } from "@ui/lib";
import type { PropsWithChildren } from "react";
import { Footer } from "./Footer";

export function AuthWrapper({
	children,
	contentClass,
}: PropsWithChildren<{ contentClass?: string }>) {
	return (
		<div className="flex min-h-screen w-full px-4 py-6 sm:px-6">
			<div className="flex w-full flex-col items-center justify-between gap-8">
				<div className="container">
					<div className="flex items-center justify-between">
						<Link to="/" className="block">
							<Logo />
						</Link>

						<div className="flex items-center justify-end gap-2">
							<ColorModeToggle />
						</div>
					</div>
				</div>

				<div className="container flex justify-center">
					<main
						className={cn(
							"w-full max-w-md rounded-2xl bg-card text-card-foreground p-4 border sm:rounded-3xl sm:p-6 lg:p-8",
							contentClass,
						)}
					>
						{children}
					</main>
				</div>

				<Footer />
			</div>
		</div>
	);
}
