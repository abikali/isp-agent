"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { Link } from "@tanstack/react-router";
import { Button } from "@ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
import { cn } from "@ui/lib";
import {
	CheckIcon,
	EditIcon,
	ExternalLinkIcon,
	MoreHorizontalIcon,
	UserPlusIcon,
	XIcon,
} from "lucide-react";
import { useState } from "react";
import { useDeleteTask, useUpdateTask } from "../hooks/use-tasks";
import { TASK_STATUS_COLORS, TASK_STATUS_OPTIONS } from "../lib/constants";
import { AssignEmployeeDialog } from "./AssignEmployeeDialog";

interface TaskRowActionsProps {
	organizationSlug: string;
	taskId: string;
	status: string;
	assignedEmployeeIds: string[];
}

export function TaskRowActions({
	organizationSlug,
	taskId,
	status,
	assignedEmployeeIds,
}: TaskRowActionsProps) {
	const organizationId = useOrganizationId();
	const updateTask = useUpdateTask();
	const deleteTask = useDeleteTask();
	const [showAssign, setShowAssign] = useState(false);

	const cancellable = status !== "CANCELLED" && status !== "COMPLETED";

	function changeStatus(next: string) {
		if (!organizationId || next === status) {
			return;
		}
		updateTask.mutate({
			organizationId,
			id: taskId,
			status: next as "OPEN",
		});
	}

	function cancelTask() {
		if (
			organizationId &&
			confirm("Cancel this task? It will be set to Cancelled.")
		) {
			deleteTask.mutate({ organizationId, id: taskId });
		}
	}

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						aria-label="Task actions"
						onClick={(e) => e.stopPropagation()}
					>
						<MoreHorizontalIcon className="size-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="end"
					className="w-48"
					onClick={(e) => e.stopPropagation()}
				>
					<DropdownMenuItem asChild>
						<Link
							to="/app/$organizationSlug/tasks/$taskId"
							params={{ organizationSlug, taskId }}
							preload="intent"
						>
							<ExternalLinkIcon className="mr-2 size-3.5" />
							Open task
						</Link>
					</DropdownMenuItem>
					<DropdownMenuItem asChild>
						<Link
							to="/app/$organizationSlug/tasks/$taskId/edit"
							params={{ organizationSlug, taskId }}
							preload="intent"
						>
							<EditIcon className="mr-2 size-3.5" />
							Edit
						</Link>
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => setShowAssign(true)}>
						<UserPlusIcon className="mr-2 size-3.5" />
						Assign worker
					</DropdownMenuItem>

					<DropdownMenuSeparator />
					<DropdownMenuLabel className="text-xs text-muted-foreground">
						Set status
					</DropdownMenuLabel>
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							Change status
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							{TASK_STATUS_OPTIONS.map((option) => (
								<DropdownMenuItem
									key={option.value}
									onSelect={() => changeStatus(option.value)}
									disabled={updateTask.isPending}
								>
									<span
										className={cn(
											"mr-2 size-2 rounded-full",
											TASK_STATUS_COLORS[option.value],
										)}
									/>
									{option.label}
									{option.value === status && (
										<CheckIcon className="ml-auto size-3.5 text-muted-foreground" />
									)}
								</DropdownMenuItem>
							))}
						</DropdownMenuSubContent>
					</DropdownMenuSub>

					{cancellable && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onSelect={cancelTask}
								className="text-destructive focus:text-destructive"
							>
								<XIcon className="mr-2 size-3.5" />
								Cancel task
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>

			<AssignEmployeeDialog
				open={showAssign}
				onOpenChange={setShowAssign}
				taskId={taskId}
				currentEmployeeIds={assignedEmployeeIds}
			/>
		</>
	);
}
