import path from "node:path";
import { fileURLToPath } from "node:url";
import contentCollections from "@content-collections/vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

// Env files live at the monorepo root, not in apps/web. Point Vite there so
// VITE_* vars (e.g. VITE_VAPID_PUBLIC_KEY) get baked in on server rebuilds
// that don't pre-export the env into the shell.
const repoRoot = path.resolve(
	fileURLToPath(new URL(".", import.meta.url)),
	"../..",
);

export default defineConfig(({ mode }) => {
	// Load env file based on `mode` (development, production, etc.)
	const env = loadEnv(mode, repoRoot, "");

	return {
		envDir: repoRoot,
		server: {
			port: 5050,
			// Allow tunnel domains for webhook testing
			// .ngrok-free.dev = ngrok (recommended by Wasender)
			// .trycloudflare.com = Cloudflare Quick Tunnels (untun)
			// .loca.lt = LocalTunnel (fallback)
			allowedHosts: [".ngrok-free.dev", ".trycloudflare.com", ".loca.lt"],
		},
		preview: {
			port: 5050,
		},
		// Ensure consistent CSS between SSR and client builds
		build: {
			cssCodeSplit: false,
			rollupOptions: {
				output: {
					// Use fixed name for CSS to avoid hash mismatch between SSR and client
					assetFileNames: (assetInfo) => {
						if (assetInfo.name?.endsWith(".css")) {
							return "assets/[name].css";
						}
						return "assets/[name]-[hash][extname]";
					},
				},
			},
		},
		// Define env vars to be replaced at build time for @repo/config
		define: {
			"process.env.VITE_SITE_URL": JSON.stringify(
				env.VITE_SITE_URL || "",
			),
			"process.env.SITE_URL": JSON.stringify(env.SITE_URL || ""),
			"process.env.AVATARS_BUCKET_NAME": JSON.stringify(
				env.AVATARS_BUCKET_NAME || "avatars",
			),
			// Force-inline the Sentry DSN into the client bundle. Auto-inlining
			// import.meta.env.VITE_SENTRY_DSN from app/router.tsx (the router
			// entry graph) proved unreliable, so define it explicitly like the
			// other build-time-baked vars above.
			"import.meta.env.VITE_SENTRY_DSN": JSON.stringify(
				env.VITE_SENTRY_DSN || "",
			),
		},
		optimizeDeps: {
			// Note: @repo/config is intentionally NOT included here
			// It should be re-evaluated on each request during development
			// to pick up config changes without restart
			include: ["@repo/auth/client"],
			exclude: ["ssh2", "cpu-features"],
		},
		// SSR configuration for browser-only packages
		ssr: {
			// Don't externalize these packages - bundle them or provide empty modules
			noExternal: [
				"browser-image-compression",
				"react-easy-crop",
				"react-dropzone",
				"recharts",
				"qrcode.react",
			],
		},
		plugins: [
			// Tailwind v4 via the official Vite plugin (replaces @tailwindcss/postcss).
			// Resolves `@import "tailwindcss"` inside Vite's module graph — consistent
			// across client + SSR + the rolldown bundler (the postcss path mis-resolved
			// it as a file during the SSR pass under rolldown-vite).
			tailwindcss(),
			// Stub native .node binaries (e.g. cpu-features used by ssh2)
			// that Rollup cannot bundle — they're optional and fail gracefully
			{
				name: "stub-node-binaries",
				resolveId(id) {
					if (id.endsWith(".node") || id.includes(".node?")) {
						return "\0native-stub";
					}
				},
				load(id) {
					if (id === "\0native-stub") {
						return "export default {}";
					}
				},
			},
			contentCollections(),
			tsConfigPaths({
				projects: ["./tsconfig.json"],
			}),
			tanstackStart({
				srcDirectory: "app",
			}),
			// Nitro creates the HTTP server for production deployment
			// Using node-cluster for multi-core CPU utilization
			nitro({
				preset: "node-cluster",
				// Exclude ffmpeg-static binary from nf3 file tracing —
				// we use system ffmpeg, not the bundled binary
				externals: ["ffmpeg-static", "ssh2", "cpu-features"],
				// Pre-compression: gzip only. brotli (quality 11) over hundreds of
				// chunks held large buffers and was the build's OOM peak on the
				// memory-constrained worker; CF/Traefik compress at the edge anyway.
				compressPublicAssets: {
					gzip: true,
					brotli: false,
				},
				// Route rules for caching and headers
				routeRules: {
					// Enable Sentry Browser Profiling via Document-Policy header
					// Required for JS Self-Profiling API in Chromium browsers
					"/**": {
						headers: {
							"document-policy": "js-profiling",
						},
					},
					// Cache static assets for 1 year (immutable)
					"/assets/**": {
						headers: {
							"cache-control":
								"public, max-age=31536000, immutable",
							"document-policy": "js-profiling",
						},
					},
					"/_build/**": {
						headers: {
							"cache-control":
								"public, max-age=31536000, immutable",
							"document-policy": "js-profiling",
						},
					},
				},
			}),
			viteReact(),
		],
	};
});
