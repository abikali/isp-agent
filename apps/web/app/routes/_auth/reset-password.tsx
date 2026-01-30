import { config } from "@repo/config";
import { ResetPasswordForm } from "@saas/auth/client";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/reset-password")({
	head: () => ({
		meta: [{ title: `Reset Password - ${config.appName}` }],
	}),
	component: ResetPasswordPage,
});

function ResetPasswordPage() {
	return <ResetPasswordForm />;
}
