import { defineEventHandler } from "nitro/h3";

/**
 * Reached only when the static-assets middleware found no file for an
 * /assets/** or /_build/** request. Without this handler the request falls
 * through to the SPA renderer, which returns the app HTML with the route's
 * `immutable, max-age=1y` cache header — Cloudflare and browsers then cache
 * that HTML as if it were the chunk for a year, breaking the app for every
 * user until a manual purge (mixed-version requests during a rolling deploy
 * trigger exactly this).
 */
export default defineEventHandler((event) => {
	event.res.status = 404;
	event.res.headers.set("cache-control", "no-store");
	return "Not Found";
});
