"use client";

import { config } from "@repo/config";
import { Link } from "@tanstack/react-router";
import { cn } from "@ui/lib";

export function Footer() {
	return (
		<footer
			className={cn(
				"container max-w-6xl py-6 text-center text-foreground/60 text-xs",
			)}
		>
			<span>
				© {new Date().getFullYear()} {config.appName}
			</span>
			<span className="opacity-50"> | </span>
			<Link to={"/legal/privacy-policy" as "/"}>Privacy policy</Link>
			<span className="opacity-50"> | </span>
			<Link to={"/legal/terms" as "/"}>Terms and conditions</Link>
		</footer>
	);
}
