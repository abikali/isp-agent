import { createFileRoute } from "@tanstack/react-router";

// Helper to dynamically import the API app
async function getApp() {
	const { app } = await import("@repo/api");
	return app;
}

export const Route = createFileRoute("/api/$")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const app = await getApp();
				return app.fetch(request);
			},
			POST: async ({ request }) => {
				const app = await getApp();
				return app.fetch(request);
			},
			PUT: async ({ request }) => {
				const app = await getApp();
				return app.fetch(request);
			},
			PATCH: async ({ request }) => {
				const app = await getApp();
				return app.fetch(request);
			},
			DELETE: async ({ request }) => {
				const app = await getApp();
				return app.fetch(request);
			},
			OPTIONS: async ({ request }) => {
				const app = await getApp();
				return app.fetch(request);
			},
		},
	},
});
