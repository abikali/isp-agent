"use client";

import { config } from "@repo/config";
import { getBeirutDate } from "@shared/lib/format";
import { Link } from "@tanstack/react-router";
import { cn } from "@ui/lib";

export function Footer() {
	return (
		<footer
			className={cn(
				"container max-w-6xl px-4 py-6 text-center text-foreground/60 text-xs sm:px-6",
			)}
		>
			<span>
				© {getBeirutDate().year} {config.appName}
			</span>
			<span className="opacity-50"> | </span>
			<Link to={"/legal/privacy-policy" as "/"}>Privacy policy</Link>
			<span className="opacity-50"> | </span>
			<Link to={"/legal/terms" as "/"}>Terms and conditions</Link>
		</footer>
	);
}
