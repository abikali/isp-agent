import { onError } from "@orpc/client";
import { experimental_SmartCoercionPlugin as SmartCoercionPlugin } from "@orpc/json-schema";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { auth } from "@repo/auth";
import { config } from "@repo/config";
import { logger } from "@repo/logs";
import { router } from "./router";
import { captureException } from "./sentry";

export const rpcHandler = new RPCHandler(router, {
	clientInterceptors: [
		onError((error) => {
			logger.error(error);
			captureException(error);
		}),
	],
});

export const openApiHandler = new OpenAPIHandler(router, {
	plugins: [
		new SmartCoercionPlugin({
			schemaConverters: [new ZodToJsonSchemaConverter()],
		}),
		new OpenAPIReferencePlugin({
			schemaConverters: [new ZodToJsonSchemaConverter()],
			specGenerateOptions: async () => {
				// Type assertion needed because better-auth plugin types break with exactOptionalPropertyTypes
				const authSchema = await (
					auth.api as unknown as {
						generateOpenAPISchema: () => Promise<{
							paths: Record<string, unknown>;
							[key: string]: unknown;
						}>;
					}
				).generateOpenAPISchema();

				authSchema.paths = Object.fromEntries(
					Object.entries(authSchema.paths).map(([path, pathItem]) => [
						`/auth${path}`,
						pathItem,
					]),
				);

				return {
					// biome-ignore lint/suspicious/noExplicitAny: Better Auth's OpenAPI schema type doesn't perfectly match oRPC's expected schema type
					...(authSchema as any),
					info: {
						title: `${config.appName} API`,
						version: "1.0.0",
					},
					servers: [
						{
							url: "/api",
						},
					],
				};
			},
			docsPath: "/docs",
		}),
	],
	clientInterceptors: [
		onError((error) => {
			logger.error(error);
			captureException(error);
		}),
	],
});
