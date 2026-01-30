import { config } from "@repo/config";
import { ForgotPasswordForm } from "@saas/auth/client";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/forgot-password")({
	head: () => ({
		meta: [{ title: `Forgot Password - ${config.appName}` }],
	}),
	component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
	return <ForgotPasswordForm />;
}
