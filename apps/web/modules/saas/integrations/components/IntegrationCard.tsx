"use client";

import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ui/components/card";
import {
	CheckCircleIcon,
	ClockIcon,
	Loader2Icon,
	PlusIcon,
} from "lucide-react";
import { getProviderIconClass } from "../lib/providers";
import type { IntegrationProvider } from "../lib/types";

interface IntegrationCardProps {
	provider: IntegrationProvider;
	isConnected: boolean;
	isConnecting: boolean;
	onConnect: () => void;
	onManage?: () => void;
}

export function IntegrationCard({
	provider,
	isConnected,
	isConnecting,
	onConnect,
	onManage,
}: IntegrationCardProps) {
	const iconClass = getProviderIconClass(provider.key);
	const isComingSoon = provider.comingSoon;

	return (
		<Card
			className={`relative overflow-hidden ${isComingSoon ? "opacity-75" : ""}`}
		>
			{isComingSoon && (
				<div className="absolute right-2 top-2">
					<Badge variant="secondary" className="text-xs">
						<ClockIcon className="mr-1 size-3" />
						Coming Soon
					</Badge>
				</div>
			)}
			{isConnected && !isComingSoon && (
				<div className="absolute right-2 top-2">
					<CheckCircleIcon className="size-5 text-green-500" />
				</div>
			)}

			<CardHeader className="pb-3">
				<div className="flex items-center gap-3">
					<div
						className={`flex size-10 items-center justify-center rounded-lg text-white font-semibold text-sm ${iconClass} ${isComingSoon ? "grayscale" : ""}`}
					>
						{provider.name.charAt(0)}
					</div>
					<div className="min-w-0 flex-1">
						<CardTitle className="text-base">
							{provider.name}
						</CardTitle>
					</div>
				</div>
			</CardHeader>

			<CardContent className="space-y-4">
				<CardDescription className="line-clamp-2 min-h-[2.5rem]">
					{provider.description}
				</CardDescription>

				{isComingSoon ? (
					<Button variant="outline" className="w-full" disabled>
						<ClockIcon className="mr-2 size-4" />
						Coming Soon
					</Button>
				) : isConnected ? (
					<Button
						variant="outline"
						className="w-full"
						onClick={onManage}
					>
						Manage
					</Button>
				) : (
					<Button
						className="w-full"
						onClick={onConnect}
						disabled={isConnecting}
					>
						{isConnecting ? (
							<>
								<Loader2Icon className="mr-2 size-4 animate-spin" />
								Connecting...
							</>
						) : (
							<>
								<PlusIcon className="mr-2 size-4" />
								Connect
							</>
						)}
					</Button>
				)}
			</CardContent>
		</Card>
	);
}
