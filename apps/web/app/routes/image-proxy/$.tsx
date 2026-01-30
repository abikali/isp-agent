import { getSignedUrl } from "@repo/storage";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/image-proxy/$" as "/api/$")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				// Path format: /image-proxy/bucket/path/to/image.jpg
				const pathParts = url.pathname
					.replace("/image-proxy/", "")
					.split("/");

				if (pathParts.length < 2) {
					return new Response("Invalid path", { status: 400 });
				}

				const bucket = pathParts[0];
				const objectPath = pathParts.slice(1).join("/");

				if (!bucket || !objectPath) {
					return new Response("Invalid path", { status: 400 });
				}

				try {
					// Get a signed URL for the object (expires in 1 hour)
					const signedUrl = await getSignedUrl(objectPath, {
						bucket,
						expiresIn: 3600,
					});

					// Redirect to the signed URL
					return Response.redirect(signedUrl, 302);
				} catch {
					return new Response("Not found", { status: 404 });
				}
			},
		},
	},
});
