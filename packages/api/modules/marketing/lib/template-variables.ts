import z from "zod";

/**
 * Variable mapping for one parameter position in a template component.
 * - "field" pulls a value from the recipient's variables map (e.g. "customer.fullName")
 * - "static" emits a fixed string for every recipient
 *
 * The actual rendering lives in the marketing-send worker; the api side
 * only validates the stored mapping shape.
 */
export const templateVariableMappingSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("static"), value: z.string() }),
	z.object({ kind: z.literal("field"), field: z.string() }),
]);

export type TemplateVariableMapping = z.infer<
	typeof templateVariableMappingSchema
>;

export const templateVariablesSchema = z.object({
	header: z.array(templateVariableMappingSchema).default([]),
	body: z.array(templateVariableMappingSchema).default([]),
	button: z.array(templateVariableMappingSchema).default([]),
});

export type TemplateVariables = z.infer<typeof templateVariablesSchema>;
