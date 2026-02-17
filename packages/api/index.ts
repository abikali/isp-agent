import { auth } from "@repo/auth";
import { logger } from "@repo/logs";
import { webhookHandler as paymentsWebhookHandler } from "@repo/payments";
import { getBaseUrl } from "@repo/utils";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { handleWebChatStream } from "./modules/ai-agents/lib/web-chat-stream-handler";
import {
	telegramWebhookHandler,
	whatsappWebhookHandler,
} from "./modules/ai-agents/lib/webhook-handlers";
import { openApiHandler, rpcHandler } from "./orpc/handler";

export const app = new Hono()
	.basePath("/api")
	// Logger middleware
	.use(honoLogger((message, ...rest) => logger.log(message, ...rest)))
	// CORS middleware - only needed for external API consumers
	// Internal app uses relative URLs (same-origin), so CORS doesn't apply
	.use(
		cors({
			origin: getBaseUrl(),
			allowHeaders: ["Content-Type", "Authorization"],
			allowMethods: ["POST", "GET", "OPTIONS"],
			exposeHeaders: ["Content-Length"],
			maxAge: 600,
			credentials: true,
		}),
	)
	// Auth handler
	.on(["POST", "GET"], "/auth/**", (c) => auth.handler(c.req.raw))
	// Payments webhook handler
	.post("/webhooks/payments", (c) => paymentsWebhookHandler(c.req.raw))
	// AI Chat webhook handlers
	.post("/webhooks/chat/whatsapp/:webhookToken", (c) =>
		whatsappWebhookHandler(c.req.raw, c.req.param("webhookToken")),
	)
	.post("/webhooks/chat/telegram/:webhookToken", (c) =>
		telegramWebhookHandler(c.req.raw, c.req.param("webhookToken")),
	)
	// AI Chat streaming endpoint
	.post("/ai-agents/web-chat/:token/stream", (c) =>
		handleWebChatStream(c.req.raw, c.req.param("token")),
	)
	// Health check
	.get("/health", (c) => c.text("OK"))
	// oRPC handlers (for RPC and OpenAPI)
	.use("*", async (c, next) => {
		const context = {
			headers: c.req.raw.headers,
		};

		const isRpc = c.req.path.includes("/rpc/");

		const handler = isRpc ? rpcHandler : openApiHandler;

		const prefix = isRpc ? "/api/rpc" : "/api";

		const { matched, response } = await handler.handle(c.req.raw, {
			prefix,
			context,
		});

		if (matched) {
			return response;
		}

		return next();
	});
