"use client";
import type { ActiveOrganization } from "@repo/auth";
import { isOrganizationAdmin } from "@repo/auth/lib/helper";
import { useSession } from "@saas/auth/client";
import { useFullOrganizationQuery } from "@saas/organizations/lib/api";
import { SettingsItem } from "@saas/shared/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/tabs";
import { Suspense, useState } from "react";
import { InviteMemberForm } from "./InviteMemberForm";
import {
	OrganizationInvitationsList,
	OrganizationInvitationsListSkeleton,
} from "./OrganizationInvitationsList";
import {
	OrganizationMembersList,
	OrganizationMembersListSkeleton,
} from "./OrganizationMembersList";

export function OrganizationMembersBlock({
	organizationId,
}: {
	organizationId: string;
}) {
	const [activeTab, setActiveTab] = useState("members");
	const { user } = useSession();
	const { data: organizationData } = useFullOrganizationQuery(organizationId);

	const organization = organizationData as
		| ActiveOrganization
		| null
		| undefined;
	const canInviteMembers = isOrganizationAdmin(organization, user);

	return (
		<>
			<SettingsItem
				title="Members"
				description="Manage members and invitations for your organization"
				fullWidth
			>
				<Tabs
					value={activeTab}
					onValueChange={(tab) => setActiveTab(tab)}
				>
					<TabsList className="mb-4">
						<TabsTrigger value="members">
							Active Members
						</TabsTrigger>
						<TabsTrigger value="invitations">
							Pending Invitations
						</TabsTrigger>
					</TabsList>
					<TabsContent value="members">
						<Suspense
							fallback={<OrganizationMembersListSkeleton />}
						>
							<OrganizationMembersList
								organizationId={organizationId}
							/>
						</Suspense>
					</TabsContent>
					<TabsContent value="invitations">
						<Suspense
							fallback={<OrganizationInvitationsListSkeleton />}
						>
							<OrganizationInvitationsList
								organizationId={organizationId}
							/>
						</Suspense>
					</TabsContent>
				</Tabs>
			</SettingsItem>

			{canInviteMembers && (
				<InviteMemberForm organizationId={organizationId} />
			)}
		</>
	);
}
