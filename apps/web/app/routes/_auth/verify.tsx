import { config } from "@repo/config";
import { OtpForm } from "@saas/auth/client";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/verify")({
	head: () => ({
		meta: [{ title: `Verify - ${config.appName}` }],
	}),
	component: VerifyPage,
});

function VerifyPage() {
	return <OtpForm />;
}
