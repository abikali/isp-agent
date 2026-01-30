"use client";
import { authClient } from "@repo/auth/client";
import { useSession } from "@saas/auth/client";
import { SettingsItem } from "@saas/shared/client";
import { Button } from "@ui/components/button";
import { useState } from "react";
import { toast } from "sonner";

export function SetPasswordForm() {
	const { user } = useSession();
	const [submitting, setSubmitting] = useState(false);

	const onSubmit = async () => {
		if (!user) {
			return;
		}

		setSubmitting(true);

		await authClient.requestPasswordReset(
			{
				email: user.email,
				redirectTo: `${window.location.origin}/reset-password`,
			},
			{
				onSuccess: () => {
					toast.success(
						"Password reset email sent. Please check your inbox.",
					);
				},
				onError: () => {
					toast.error(
						"Failed to send password reset email. Please try again.",
					);
				},
				onResponse: () => {
					setSubmitting(false);
				},
			},
		);
	};

	return (
		<SettingsItem
			title="Set Password"
			description="Set a password for your account to use password-based login."
		>
			<div className="flex justify-end">
				<Button type="submit" loading={submitting} onClick={onSubmit}>
					Send Reset Email
				</Button>
			</div>
		</SettingsItem>
	);
}
