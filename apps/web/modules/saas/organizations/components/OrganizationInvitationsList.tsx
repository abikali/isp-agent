"use client";

import type { ActiveOrganization } from "@repo/auth";
import { authClient } from "@repo/auth/client";
import { isOrganizationAdmin } from "@repo/auth/lib/helper";
import { useSession } from "@saas/auth/client";
import {
	organizationsQueryKeys,
	useFullOrganizationSuspense,
} from "@saas/organizations/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
import { Skeleton } from "@ui/components/skeleton";
import { Table, TableBody, TableCell, TableRow } from "@ui/components/table";
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
						className="flex items-center justify-between p-4"
					>
						<div className="space-y-1">
							<Skeleton className="h-4 w-48" />
							<Skeleton className="h-3 w-32" />
						</div>
						<div className="flex gap-2">
							<Skeleton className="h-9 w-24" />
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
			new Intl.DateTimeFormat("en-US", {
				dateStyle: "medium",
				timeStyle: "short",
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
			organization?.invitations
				?.filter((invitation) => invitation.status === "pending")
				.sort(
					(a, b) =>
						new Date(a.expiresAt).getTime() -
						new Date(b.expiresAt).getTime(),
				) ?? [],
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

	return (
		<div className="overflow-x-auto rounded-md border">
			<Table>
				<TableBody>
					{invitations.length > 0 ? (
						invitations.map((invitation) => {
							const StatusIcon =
								STATUS_ICONS[
									invitation.status as keyof typeof STATUS_ICONS
								] ?? ClockIcon;
							const isPending = invitation.status === "pending";

							return (
								<TableRow key={invitation.id}>
									<TableCell>
										<div className="leading-normal">
											<strong
												className={cn("block", {
													"opacity-50":
														invitation.status ===
														"canceled",
												})}
											>
												{invitation.email}
											</strong>
											<small className="flex flex-wrap gap-1 text-foreground/60">
												<span className="flex items-center gap-0.5">
													<StatusIcon className="size-3" />
													{invitation.status
														.charAt(0)
														.toUpperCase() +
														invitation.status.slice(
															1,
														)}
												</span>
												<span>-</span>
												<span>
													Expires{" "}
													{dateFormatter.format(
														new Date(
															invitation.expiresAt,
														),
													)}
												</span>
											</small>
										</div>
									</TableCell>
									<TableCell className="text-right">
										<div className="flex flex-row justify-end gap-2">
											<OrganizationRoleSelect
												value={invitation.role}
												disabled
												onSelect={() => {}}
												organizationId={organizationId}
											/>
											{canUserEditInvitations && (
												<DropdownMenu>
													<DropdownMenuTrigger
														asChild
													>
														<Button
															size="icon"
															variant="ghost"
														>
															<MoreVerticalIcon className="size-4" />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent>
														<DropdownMenuItem
															disabled={
																!isPending
															}
															onClick={() =>
																revokeInvitation(
																	invitation.id,
																)
															}
														>
															<MailXIcon className="mr-2 size-4" />
															Revoke Invitation
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											)}
										</div>
									</TableCell>
								</TableRow>
							);
						})
					) : (
						<TableRow>
							<TableCell colSpan={2} className="h-24 text-center">
								No pending invitations
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</div>
	);
}
