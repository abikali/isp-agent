import { ORPCError } from "@orpc/server";
import { toLebaneseLandline } from "@repo/utils";
import z from "zod";

/**
 * An answer to "does the customer have a landline?" — from the collector
 * payment sheet or the customer edit form. `has: null` (edit form only)
 * resets the customer to "never asked", so collectors ask again.
 */
export const landlineAnswerSchema = z.union([
	z.object({ has: z.literal(true), number: z.string().max(30) }),
	z.object({ has: z.literal(false) }),
	z.object({ has: z.null() }),
]);

/** Customer columns for an answer; throws on a number that isn't a landline. */
export function landlineUpdate(answer: z.infer<typeof landlineAnswerSchema>) {
	if (answer.has === null) {
		return { hasLandline: null, landline: null, landlineCheckedAt: null };
	}
	const landline = answer.has ? toLebaneseLandline(answer.number) : null;
	if (answer.has && !landline) {
		throw new ORPCError("BAD_REQUEST", {
			message:
				"Enter a valid Lebanese landline (area code + 6 digits, e.g. 04 123456)",
		});
	}
	return { hasLandline: answer.has, landline, landlineCheckedAt: new Date() };
}
