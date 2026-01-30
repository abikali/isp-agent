"use client";

import { authClient } from "@repo/auth/client";
import { useOrganizationListQuery } from "@saas/organizations/lib/api";
import { SettingsItem, useConfirmationAlert } from "@saas/shared/client";
import { useRouter } from "@shared/hooks/router";
import { Button } from "@ui/components/button";
import { toast } from "sonner";
import { useActiveOrganization } from "../hooks/use-active-organization";

export function DeleteOrganizationForm() {
	const router = useRouter();
	const { confirm } = useConfirmationAlert();
	const { refetch: reloadOrganizations } = useOrganizationListQuery();
	const { activeOrganization, setActiveOrganization } =
		useActiveOrganization();

	if (!activeOrganization) {
		return null;
	}

	const handleDelete = async () => {
		confirm({
			title: "Delete Organization",
			message:
				"Are you sure you want to delete this organization? This action cannot be undone.",
			destructive: true,
			onConfirm: async () => {
				const { error } = await authClient.organization.delete({
					organizationId: activeOrganization.id,
				});

				if (error) {
					toast.error("Failed to delete organization");
					return;
				}

				toast.success("Organization deleted successfully");
				await setActiveOrganization(null);
				await reloadOrganizations();
				router.replace("/app");
			},
		});
	};

	return (
		<SettingsItem
			danger
			title="Delete Organization"
			description="Permanently delete this organization and all associated data"
		>
			<div className="mt-4 flex justify-end">
				<Button variant="destructive" onClick={handleDelete}>
					Delete Organization
				</Button>
			</div>
		</SettingsItem>
	);
}
