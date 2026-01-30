"use client";

import { config } from "@repo/config";
import { Link, useRouter } from "@tanstack/react-router";
import { Button } from "@ui/components/button";
import { ArrowLeftIcon, HomeIcon, SearchIcon } from "lucide-react";

interface AppNotFoundProps {
	title?: string;
	description?: string;
}

export function AppNotFound({
	title = "Page not found",
	description = "The page you're looking for doesn't exist or has been moved.",
}: AppNotFoundProps) {
	const router = useRouter();

	return (
		<div className="flex min-h-[80vh] flex-col items-center justify-center p-4">
			<div className="w-full max-w-md space-y-6 text-center">
				<div className="mx-auto flex size-20 items-center justify-center rounded-full bg-muted">
					<SearchIcon className="size-10 text-muted-foreground" />
				</div>

				<div className="space-y-2">
					<p className="text-6xl font-bold text-muted-foreground/50">
						404
					</p>
					<h1 className="text-2xl font-semibold tracking-tight">
						{title}
					</h1>
					<p className="text-muted-foreground">{description}</p>
				</div>

				<div className="rounded-lg border bg-card p-4 text-left">
					<p className="mb-2 text-sm font-medium">
						This could happen if:
					</p>
					<ul className="space-y-1 text-sm text-muted-foreground">
						<li className="flex items-start gap-2">
							<span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground" />
							The URL was typed incorrectly
						</li>
						<li className="flex items-start gap-2">
							<span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground" />
							The page has been moved or deleted
						</li>
						<li className="flex items-start gap-2">
							<span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground" />
							You don't have permission to view this page
						</li>
					</ul>
				</div>

				<div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-center">
					<Button
						variant="outline"
						onClick={() => router.history.back()}
						className="gap-2"
					>
						<ArrowLeftIcon className="size-4" />
						Go back
					</Button>
					<Button asChild className="gap-2">
						<Link to="/app">
							<HomeIcon className="size-4" />
							Go to Dashboard
						</Link>
					</Button>
				</div>
			</div>

			<footer className="mt-auto pt-8 text-center text-xs text-muted-foreground">
				<span>
					© {new Date().getFullYear()} {config.appName}
				</span>
			</footer>
		</div>
	);
}
