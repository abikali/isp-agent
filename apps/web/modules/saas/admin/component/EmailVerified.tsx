import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@ui/components/tooltip";
import { cn } from "@ui/lib";
import { CheckIcon, ClockIcon } from "lucide-react";

export function EmailVerified({
	verified,
	className,
}: {
	verified: boolean;
	className?: string;
}) {
	return (
		<TooltipProvider delayDuration={0}>
			<Tooltip>
				<TooltipContent>
					{verified ? "Email verified" : "Waiting for verification"}
				</TooltipContent>
				<TooltipTrigger className={cn(className)}>
					{verified ? (
						<CheckIcon className="size-3 text-primary" />
					) : (
						<ClockIcon className="size-3" />
					)}
				</TooltipTrigger>
			</Tooltip>
		</TooltipProvider>
	);
}
