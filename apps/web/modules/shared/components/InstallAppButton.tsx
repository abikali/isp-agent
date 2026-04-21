"use client";

import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { DownloadIcon, ShareIcon } from "lucide-react";
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIos() {
	if (typeof window === "undefined") {
		return false;
	}
	return (
		/iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window)
	);
}

function isStandalone() {
	if (typeof window === "undefined") {
		return false;
	}
	const navStandalone = (navigator as Navigator & { standalone?: boolean })
		.standalone;
	return (
		window.matchMedia("(display-mode: standalone)").matches ||
		navStandalone === true
	);
}

const DISMISS_KEY = "install-prompt-dismissed";

export function InstallAppButton() {
	const [promptEvent, setPromptEvent] =
		useState<BeforeInstallPromptEvent | null>(null);
	const [showIosDialog, setShowIosDialog] = useState(false);
	const [mounted, setMounted] = useState(false);
	const [dismissed, setDismissed] = useState(false);

	useEffect(() => {
		setMounted(true);
		setDismissed(localStorage.getItem(DISMISS_KEY) === "1");

		function handle(event: Event) {
			event.preventDefault();
			setPromptEvent(event as BeforeInstallPromptEvent);
		}
		window.addEventListener("beforeinstallprompt", handle);
		return () => window.removeEventListener("beforeinstallprompt", handle);
	}, []);

	if (!mounted || isStandalone() || dismissed) {
		return null;
	}

	const canInstallNatively = promptEvent !== null;
	const iosEligible = isIos();

	if (!canInstallNatively && !iosEligible) {
		return null;
	}

	async function handleClick() {
		if (promptEvent) {
			await promptEvent.prompt();
			const { outcome } = await promptEvent.userChoice;
			if (outcome === "accepted") {
				localStorage.setItem(DISMISS_KEY, "1");
				setDismissed(true);
			}
			setPromptEvent(null);
			return;
		}
		setShowIosDialog(true);
	}

	function handleDismiss() {
		localStorage.setItem(DISMISS_KEY, "1");
		setDismissed(true);
		setShowIosDialog(false);
	}

	return (
		<>
			<Button
				variant="outline"
				size="sm"
				onClick={handleClick}
				className="hidden md:inline-flex"
			>
				<DownloadIcon className="mr-2 size-4" />
				Install app
			</Button>
			<Button
				variant="ghost"
				size="icon"
				onClick={handleClick}
				className="md:hidden"
				aria-label="Install app"
			>
				<DownloadIcon className="size-4" />
			</Button>

			<Dialog open={showIosDialog} onOpenChange={setShowIosDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							Install LibanCom on your iPhone
						</DialogTitle>
						<DialogDescription>
							Add the app to your home screen so you get a desktop
							icon and badge notifications.
						</DialogDescription>
					</DialogHeader>
					<ol className="space-y-3 text-sm">
						<li className="flex gap-3">
							<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
								1
							</span>
							<span className="flex-1">
								Tap the{" "}
								<ShareIcon className="inline size-4 align-text-bottom" />{" "}
								<strong>Share</strong> button at the bottom of
								Safari.
							</span>
						</li>
						<li className="flex gap-3">
							<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
								2
							</span>
							<span className="flex-1">
								Scroll down and tap{" "}
								<strong>Add to Home Screen</strong>.
							</span>
						</li>
						<li className="flex gap-3">
							<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
								3
							</span>
							<span className="flex-1">
								Tap <strong>Add</strong> in the top right.
							</span>
						</li>
					</ol>
					<DialogFooter>
						<Button variant="outline" onClick={handleDismiss}>
							Don't show again
						</Button>
						<Button onClick={() => setShowIosDialog(false)}>
							Got it
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
