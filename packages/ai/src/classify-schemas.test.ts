import { zodSchema } from "ai";
import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { escalationSchema } from "./escalation-guard";
import { escalationSummarySchema } from "./escalation-summary";
import { teammateReplySchema } from "./teammate-reply";
import { triageSchema } from "./triage";

vi.mock("@repo/database", () => ({ db: {} }));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/**
 * Every structured-output schema sent to a helper model must list ALL of its
 * properties in `required`. Azure-routed OpenRouter models enforce strict
 * JSON schemas and reject the call otherwise — `.optional()` and `.default()`
 * silently broke triage and the escalation guard on prod. Use `.nullable()`.
 */
const SCHEMAS: Record<string, z.ZodType> = {
	triageSchema,
	escalationSchema,
	teammateReplySchema,
	escalationSummarySchema,
};

describe("helper classifier schemas", () => {
	for (const [name, schema] of Object.entries(SCHEMAS)) {
		it(`${name} lists every property as required`, async () => {
			const json = (await zodSchema(schema).jsonSchema) as {
				properties?: Record<string, unknown>;
				required?: string[];
			};
			const keys = Object.keys(json.properties ?? {});
			expect(keys.length).toBeGreaterThan(0);
			expect([...(json.required ?? [])].sort()).toEqual([...keys].sort());
		});
	}
});
