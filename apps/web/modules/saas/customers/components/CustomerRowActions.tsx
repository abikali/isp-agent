"use client";

import { Link } from "@tanstack/react-router";
import { Button } from "@ui/components/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@ui/components/tooltip";
import { MapPinOffIcon, PencilIcon } from "lucide-react";
import { useCreateLocationRequest } from "../hooks/use-customers";

interface CustomerRowActionsProps {
	customerId: string;
	organizationSlug: string;
	hasLocation: boolean;
	onRequestLocation: () => void;
}

/**
 * Per-row action cell for the customers table. Subscribes to
 * `useCreateLocationRequest` locally so the pending flip only re-renders
 * this one cell — keeping it out of the parent `columns` useMemo.
 */
export function CustomerRowActions({
	customerId,
	organizationSlug,
	hasLocation,
	onRequestLocation,
}: CustomerRowActionsProps) {
	const createLocationRequest = useCreateLocationRequest();
	return (
		<div className="flex items-center justify-end gap-0.5">
			{!hasLocation && (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-8"
							disabled={createLocationRequest.isPending}
							onClick={(e) => {
								e.stopPropagation();
								onRequestLocation();
							}}
						>
							<MapPinOffIcon className="size-4 text-amber-600" />
							<span className="sr-only">Request location</span>
						</Button>
					</TooltipTrigger>
					<TooltipContent>Request location</TooltipContent>
				</Tooltip>
			)}
			<Button variant="ghost" size="icon" className="size-8" asChild>
				<Link
					to="/app/$organizationSlug/customers/$customerId"
					params={{ organizationSlug, customerId }}
					preload="intent"
				>
					<PencilIcon className="size-4" />
					<span className="sr-only">Edit</span>
				</Link>
			</Button>
		</div>
	);
}
