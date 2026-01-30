import { config } from "@repo/config";
import { Logo } from "@shared/components/Logo";
import { Link } from "@tanstack/react-router";
import { HeartIcon } from "lucide-react";

export function Footer() {
	return (
		<footer className="border-t border-border text-sm">
			<div className="container grid grid-cols-1 gap-8 py-12 md:grid-cols-2 lg:grid-cols-3">
				<div>
					<Logo className="opacity-70 grayscale" />
					<p className="mt-4 text-sm text-muted-foreground">
						© {new Date().getFullYear()} {config.appName}. All
						rights reserved.
					</p>
				</div>

				<div className="flex flex-col gap-3">
					<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Product
					</p>
					<Link
						to="/blog"
						className="text-muted-foreground transition-colors hover:text-foreground"
					>
						Blog
					</Link>
					<a
						href="#features"
						className="text-muted-foreground transition-colors hover:text-foreground"
					>
						Features
					</a>
					<a
						href="/#pricing"
						className="text-muted-foreground transition-colors hover:text-foreground"
					>
						Pricing
					</a>
				</div>

				<div className="flex flex-col gap-3">
					<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Legal
					</p>
					<Link
						to={"/legal/privacy-policy" as "/"}
						className="text-muted-foreground transition-colors hover:text-foreground"
					>
						Privacy policy
					</Link>
					<Link
						to={"/legal/terms" as "/"}
						className="text-muted-foreground transition-colors hover:text-foreground"
					>
						Terms and conditions
					</Link>
				</div>
			</div>

			<div className="border-t border-border">
				<div className="container flex items-center justify-center py-6">
					<p className="flex items-center gap-1 text-xs text-muted-foreground/60">
						<span>Made with</span>
						<HeartIcon className="size-3 fill-current text-red-500" />
						<span>by</span>
						<a
							href="https://abiroot.com/?utm_source=libancom&utm_medium=website&utm_campaign=footer"
							target="_blank"
							rel="noopener noreferrer"
							className="font-medium text-muted-foreground/80 transition-colors hover:text-foreground"
						>
							abiroot.com
						</a>
					</p>
				</div>
			</div>
		</footer>
	);
}
