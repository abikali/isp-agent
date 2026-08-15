import { createServer, type Server } from "node:http";
import { logger } from "@repo/logs";

const startedAt = Date.now();

/**
 * Minimal liveness endpoint for the container HEALTHCHECK.
 *
 * Uses node:http rather than Hono deliberately: this needs zero dependencies so
 * the identical file works in every app's worker (two of them don't ship Hono),
 * and it must stay cheap because the healthcheck polls it on a timer.
 *
 * LIVENESS ONLY, by design. It answers "is the event loop still turning?" —
 * the failure that is otherwise completely invisible, because a wedged worker
 * keeps its container in `Up` with no signal at all. It deliberately does NOT
 * fail when Redis is briefly unreachable: transient reconnects are normal
 * during a rollout, and failing on them would turn a blip into restart churn.
 */
export function startHealthServer(
	port = Number(process.env["WORKER_HEALTH_PORT"] ?? 9091),
): Server {
	const server = createServer((req, res) => {
		if (req.method === "GET" && req.url === "/health") {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(
				JSON.stringify({
					status: "ok",
					uptime: Math.floor((Date.now() - startedAt) / 1000),
				}),
			);
			return;
		}
		res.writeHead(404);
		res.end();
	});

	// Loopback only — the HEALTHCHECK runs inside the container, so there is no
	// reason to expose this on the Docker network.
	server.listen(port, "127.0.0.1", () => {
		logger.info("Worker health server listening", { port });
	});

	// Never let a health-server problem take the worker down: the jobs are the
	// point, this is only observability.
	server.on("error", (error) => {
		logger.error("Worker health server error", { error });
	});

	return server;
}
