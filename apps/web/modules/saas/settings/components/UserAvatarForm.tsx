"use client";
import { SettingsItem } from "@saas/shared/client";
import { toast } from "sonner";
import { UserAvatarUpload } from "./UserAvatarUpload";

export function UserAvatarForm() {
	return (
		<SettingsItem
			title="Profile Picture"
			description="Update your profile picture"
		>
			<UserAvatarUpload
				onSuccess={() => {
					toast.success("Profile picture updated successfully");
				}}
				onError={() => {
					toast.error("Failed to update profile picture");
				}}
			/>
		</SettingsItem>
	);
}
