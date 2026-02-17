import contentCollections from "@content-collections/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
	// Load env file based on `mode` (development, production, etc.)
	const env = loadEnv(mode, process.cwd(), "");

	return {
		server: {
			port: 5050,
			// Allow tunnel domains for webhook testing in E2E
			// .trycloudflare.com = Cloudflare Quick Tunnels (untun)
			// .loca.lt = LocalTunnel (fallback)
			allowedHosts: [".trycloudflare.com", ".loca.lt"],
		},
		preview: {
			port: 5050,
		},
		// Ensure consistent CSS between SSR and client builds
		build: {
			cssCodeSplit: false,
			// Use fixed asset filenames to prevent SSR/client hash mismatch
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
		},
		optimizeDeps: {
			// Note: @repo/config is intentionally NOT included here
			// It should be re-evaluated on each request during development
			// to pick up config changes without restart
			include: ["@repo/auth/client"],
		},
		// SSR configuration for browser-only packages
		ssr: {
			// Don't externalize these packages - bundle them or provide empty modules
			noExternal: [
				"browser-image-compression",
				"react-easy-crop",
				"react-colorful",
				"react-dropzone",
				"recharts",
				"qrcode.react",
				"@fingerprintjs/fingerprintjs",
			],
			// Pre-bundle CJS packages to fix deprecation warnings
			optimizeDeps: {
				include: ["@paralleldrive/cuid2"],
			},
		},
		plugins: [
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
				// Enable pre-compression for faster asset delivery
				compressPublicAssets: {
					gzip: true,
					brotli: true,
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
