"use client";

import { authClient } from "@repo/auth/client";
import { useSession } from "@saas/auth/client";
import { SettingsItem, useConfirmationAlert } from "@saas/shared/client";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@ui/components/button";
import { toast } from "sonner";

export function DeleteAccountForm() {
	const { reloadSession } = useSession();
	const { confirm } = useConfirmationAlert();

	const deleteUserMutation = useMutation({
		mutationFn: async () => {
			const { error } = await authClient.deleteUser({});

			if (error) {
				throw error;
			}
		},
		onSuccess: () => {
			toast.success("Account deleted successfully");
			reloadSession();
		},
		onError: () => {
			toast.error("Failed to delete account");
		},
	});

	const confirmDelete = () => {
		confirm({
			title: "Delete Account",
			message:
				"Are you sure you want to delete your account? This action cannot be undone.",
			onConfirm: async () => {
				await deleteUserMutation.mutateAsync();
			},
		});
	};

	return (
		<SettingsItem
			danger
			title="Delete Account"
			description="Permanently delete your account and all associated data"
		>
			<div className="mt-4 flex justify-end">
				<Button variant="destructive" onClick={() => confirmDelete()}>
					Delete Account
				</Button>
			</div>
		</SettingsItem>
	);
}
