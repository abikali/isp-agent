"use client";

import type { ActiveOrganization } from "@repo/auth";
import { authClient } from "@repo/auth/client";
import { isOrganizationAdmin } from "@repo/auth/lib/helper";
import { useSession } from "@saas/auth/client";
import {
	organizationsQueryKeys,
	useFullOrganizationSuspense,
} from "@saas/organizations/lib/api";
import { BEIRUT_TIMEZONE } from "@shared/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
import { Skeleton } from "@ui/components/skeleton";
import { cn } from "@ui/lib";
import {
	CheckIcon,
	ClockIcon,
	MailXIcon,
	MoreVerticalIcon,
	XIcon,
} from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { OrganizationRoleSelect } from "./OrganizationRoleSelect";

/**
 * Loading skeleton for the invitations list.
 */
export function OrganizationInvitationsListSkeleton() {
	return (
		<div className="rounded-md border">
			<div className="divide-y">
				{Array.from({ length: 2 }).map((_, i) => (
					<div
						key={i}
						className="flex items-center justify-between gap-2 p-4"
					>
						<div className="space-y-1 min-w-0">
							<Skeleton className="h-4 w-32 sm:w-48" />
							<Skeleton className="h-3 w-24 sm:w-32" />
						</div>
						<div className="flex gap-2 shrink-0">
							<Skeleton className="h-9 w-20 sm:w-24 hidden sm:block" />
							<Skeleton className="size-9" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

const STATUS_ICONS = {
	pending: ClockIcon,
	accepted: CheckIcon,
	rejected: XIcon,
	canceled: XIcon,
} as const;

interface Invitation {
	id: string;
	email: string;
	status: string;
	role: string;
	expiresAt: string | Date;
}

/**
 * Invitations list component using Suspense for data fetching.
 * MUST be wrapped in a Suspense boundary.
 */
export function OrganizationInvitationsList({
	organizationId,
}: {
	organizationId: string;
}) {
	const queryClient = useQueryClient();
	const { user } = useSession();
	const { data: organizationData } =
		useFullOrganizationSuspense(organizationId);

	const dateFormatter = useMemo(
		() =>
			new Intl.DateTimeFormat("en-GB", {
				dateStyle: "medium",
				timeStyle: "short",
				timeZone: BEIRUT_TIMEZONE,
			}),
		[],
	);

	const organization = organizationData as
		| ActiveOrganization
		| null
		| undefined;
	const canUserEditInvitations = isOrganizationAdmin(organization, user);

	const invitations = useMemo(
		() =>
			(organization?.invitations
				?.filter((invitation) => invitation.status === "pending")
				.sort(
					(a, b) =>
						new Date(a.expiresAt).getTime() -
						new Date(b.expiresAt).getTime(),
				) ?? []) as Invitation[],
		[organization?.invitations],
	);

	const revokeInvitation = (invitationId: string) => {
		toast.promise(
			async () => {
				const { error } =
					await authClient.organization.cancelInvitation({
						invitationId,
					});
				if (error) {
					throw error;
				}
			},
			{
				loading: "Revoking invitation...",
				success: () => {
					queryClient.invalidateQueries({
						queryKey: organizationsQueryKeys.detail(organizationId),
					});
					return "Invitation revoked successfully";
				},
				error: (error: { message?: string }) =>
					error?.message || "Failed to revoke invitation",
			},
		);
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: revokeInvitation is stable enough via other deps
	const columns: ColumnDef<Invitation, unknown>[] = useMemo(
		() => [
			{
				accessorKey: "email",
				header: "Invitation",
				cell: ({ row }) => {
					const invitation = row.original;
					const StatusIcon =
						STATUS_ICONS[
							invitation.status as keyof typeof STATUS_ICONS
						] ?? ClockIcon;

					return (
						<div className="leading-normal">
							<strong
								className={cn("block", {
									"opacity-50":
										invitation.status === "canceled",
								})}
							>
								{invitation.email}
							</strong>
							<small className="flex flex-wrap gap-1 text-foreground/60">
								<span className="flex items-center gap-0.5">
									<StatusIcon className="size-3" />
									{invitation.status.charAt(0).toUpperCase() +
										invitation.status.slice(1)}
								</span>
								<span>-</span>
								<span>
									Expires{" "}
									{dateFormatter.format(
										new Date(invitation.expiresAt),
									)}
								</span>
							</small>
						</div>
					);
				},
			},
			{
				id: "actions",
				header: "Role",
				enableSorting: false,
				cell: ({ row }) => {
					const invitation = row.original;
					const isPending = invitation.status === "pending";

					return (
						<div className="flex flex-row justify-end gap-2">
							<OrganizationRoleSelect
								value={invitation.role}
								disabled
								onSelect={() => {}}
								organizationId={organizationId}
							/>
							{canUserEditInvitations && (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button size="icon" variant="ghost">
											<MoreVerticalIcon className="size-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent>
										<DropdownMenuItem
											disabled={!isPending}
											onClick={() =>
												revokeInvitation(invitation.id)
											}
										>
											<MailXIcon className="mr-2 size-4" />
											Revoke Invitation
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							)}
						</div>
					);
				},
			},
		],
		[canUserEditInvitations, dateFormatter, organizationId],
	);

	return (
		<DataTable
			columns={columns}
			data={invitations}
			emptyState={
				<div className="rounded-xl border bg-card py-8 text-center text-muted-foreground">
					No pending invitations
				</div>
			}
		/>
	);
}
