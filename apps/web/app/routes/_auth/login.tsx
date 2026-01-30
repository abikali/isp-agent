import { config } from "@repo/config";
import { LoginForm } from "@saas/auth/components/LoginForm";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/login")({
	head: () => ({
		meta: [{ title: `Login - ${config.appName}` }],
	}),
	component: LoginPage,
});

function LoginPage() {
	return <LoginForm />;
}
