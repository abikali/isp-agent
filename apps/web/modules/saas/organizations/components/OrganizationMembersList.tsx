"use client";

import type { ActiveOrganization } from "@repo/auth";
import { authClient } from "@repo/auth/client";
import { isOrganizationAdmin } from "@repo/auth/lib/helper";
import { useSession } from "@saas/auth/client";
import {
	organizationsQueryKeys,
	useFullOrganizationSuspense,
} from "@saas/organizations/lib/api";
import { Pagination } from "@saas/shared/client";
import { UserAvatar } from "@shared/components/UserAvatar";
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
import { LogOutIcon, MoreVerticalIcon, TrashIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ORGANIZATION_MEMBER_ROLES } from "../hooks/member-roles";
import { OrganizationRoleSelect } from "./OrganizationRoleSelect";

const MEMBERS_PER_PAGE = 20;

/**
 * Loading skeleton for the members list.
 */
export function OrganizationMembersListSkeleton() {
	return (
		<div className="rounded-md border">
			<div className="divide-y">
				{Array.from({ length: 3 }).map((_, i) => (
					<div
						key={i}
						className="flex items-center justify-between p-4"
					>
						<div className="flex items-center gap-2">
							<Skeleton className="size-10 rounded-full" />
							<div className="space-y-1">
								<Skeleton className="h-4 w-32" />
								<Skeleton className="h-3 w-48" />
							</div>
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

/**
 * Members list component using Suspense for data fetching.
 * MUST be wrapped in a Suspense boundary.
 */
export function OrganizationMembersList({
	organizationId,
}: {
	organizationId: string;
}) {
	const queryClient = useQueryClient();
	const { user } = useSession();
	const { data: organizationData } =
		useFullOrganizationSuspense(organizationId);

	const [currentPage, setCurrentPage] = useState(1);

	const organization = organizationData as
		| ActiveOrganization
		| null
		| undefined;
	const userIsOrganizationAdmin = isOrganizationAdmin(organization, user);
	const members = organization?.members ?? [];

	// Paginate members client-side
	const paginatedMembers = useMemo(() => {
		const start = (currentPage - 1) * MEMBERS_PER_PAGE;
		return members.slice(start, start + MEMBERS_PER_PAGE);
	}, [members, currentPage]);

	const updateMemberRole = async (memberId: string, role: string) => {
		toast.promise(
			async () => {
				await authClient.organization.updateMemberRole({
					memberId,
					role,
					organizationId,
				});
			},
			{
				loading: "Updating member role...",
				success: () => {
					queryClient.invalidateQueries({
						queryKey: organizationsQueryKeys.detail(organizationId),
					});
					return "Member role updated successfully";
				},
				error: (error: { message?: string }) =>
					error?.message || "Failed to update member role",
			},
		);
	};

	const removeMember = async (memberId: string) => {
		toast.promise(
			async () => {
				await authClient.organization.removeMember({
					memberIdOrEmail: memberId,
					organizationId,
				});
			},
			{
				loading: "Removing member...",
				success: () => {
					queryClient.invalidateQueries({
						queryKey: organizationsQueryKeys.detail(organizationId),
					});
					return "Member removed successfully";
				},
				error: (error: { message?: string }) =>
					error?.message || "Failed to remove member",
			},
		);
	};

	return (
		<div className="space-y-4">
			<div className="overflow-x-auto rounded-md border">
				<Table>
					<TableBody>
						{paginatedMembers.length > 0 ? (
							paginatedMembers.map((member) => (
								<TableRow key={member.id}>
									<TableCell>
										{member.user && (
											<div className="flex items-center gap-2">
												<UserAvatar
													name={
														member.user.name ??
														member.user.email
													}
													avatarUrl={
														member.user.image
													}
												/>
												<div>
													<strong className="block">
														{member.user.name}
													</strong>
													<small className="text-foreground/60">
														{member.user.email}
													</small>
												</div>
											</div>
										)}
									</TableCell>
									<TableCell className="text-right">
										<div className="flex flex-row justify-end gap-2">
											{userIsOrganizationAdmin ? (
												<>
													<OrganizationRoleSelect
														value={member.role}
														onSelect={(value) =>
															updateMemberRole(
																member.id,
																value,
															)
														}
														disabled={
															!userIsOrganizationAdmin ||
															member.role ===
																"owner"
														}
														organizationId={
															organizationId
														}
													/>
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
															{member.userId !==
																user?.id && (
																<DropdownMenuItem
																	disabled={
																		!isOrganizationAdmin(
																			organization,
																			user,
																		)
																	}
																	className="text-destructive"
																	onClick={() =>
																		removeMember(
																			member.id,
																		)
																	}
																>
																	<TrashIcon className="mr-2 size-4" />
																	Remove
																	Member
																</DropdownMenuItem>
															)}
															{member.userId ===
																user?.id &&
																member.role !==
																	"owner" && (
																	<DropdownMenuItem
																		className="text-destructive"
																		onClick={() =>
																			removeMember(
																				member.id,
																			)
																		}
																	>
																		<LogOutIcon className="mr-2 size-4" />
																		Leave
																		Organization
																	</DropdownMenuItem>
																)}
														</DropdownMenuContent>
													</DropdownMenu>
												</>
											) : (
												<span className="font-medium text-foreground/60 text-sm">
													{
														ORGANIZATION_MEMBER_ROLES[
															member.role as keyof typeof ORGANIZATION_MEMBER_ROLES
														]
													}
												</span>
											)}
										</div>
									</TableCell>
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell
									colSpan={2}
									className="h-24 text-center"
								>
									No members found
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			{members.length > MEMBERS_PER_PAGE && (
				<Pagination
					totalItems={members.length}
					itemsPerPage={MEMBERS_PER_PAGE}
					currentPage={currentPage}
					onChangeCurrentPage={setCurrentPage}
				/>
			)}
		</div>
	);
}
