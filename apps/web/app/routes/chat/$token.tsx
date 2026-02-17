import { WebChatInterface } from "@saas/ai-agents/components/WebChatInterface";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/chat/$token")({
	component: WebChatPage,
});

function WebChatPage() {
	const { token } = Route.useParams();
	return <WebChatInterface token={token} />;
}
