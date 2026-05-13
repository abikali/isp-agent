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

/**
 * Media payload for templates with a non-TEXT header (IMAGE/VIDEO/DOCUMENT).
 * One URL per broadcast — every recipient gets the same media. WhatsApp will
 * reject the send if the template declares a media header and no `headerMedia`
 * is supplied here.
 */
export const templateHeaderMediaSchema = z.object({
	kind: z.enum(["image", "video", "document"]),
	url: z.string().url(),
	filename: z.string().optional(),
});

export type TemplateHeaderMedia = z.infer<typeof templateHeaderMediaSchema>;

export const templateVariablesSchema = z.object({
	header: z.array(templateVariableMappingSchema).default([]),
	body: z.array(templateVariableMappingSchema).default([]),
	button: z.array(templateVariableMappingSchema).default([]),
	headerMedia: templateHeaderMediaSchema.optional(),
});

export type TemplateVariables = z.infer<typeof templateVariablesSchema>;
