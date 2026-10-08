import { z } from "zod";
import { classifyText } from "./classify";
import { helperModelId, type ModelCredentials } from "./model-registry";

/**
 * Is this text someone wanting fiber internet? The fiber control room only
 * takes leads that are — a keyword match can't tell "I want fiber" from "I'm
 * on fiber and my internet is down" or "the lag is Ogero's fault".
 */

// Both fields required: some providers reject schemas with optional keys.
export const fiberInterestSchema = z.object({
	fiberRequest: z.boolean(),
	summary: z
		.string()
		.describe(
			"One short plain-English sentence a salesperson reads before calling: what this person wants or said about fiber. Empty when fiberRequest is false.",
		),
});

export type FiberInterest = z.infer<typeof fiberInterestSchema>;

const SYSTEM = `LibanCom is a Lebanese internet provider (mostly wireless). Ogero / the Ministry of Telecommunications is installing fiber-optic boxes in buildings, and LibanCom sells and installs fiber on those boxes. Decide whether a text is a FIBER REQUEST: a person interested in getting, pricing, or checking availability of fiber internet.

fiberRequest = true when the person:
- asks to install / switch to / subscribe to fiber, or asks its price, speed, offer, contract or free installation;
- asks whether fiber has reached their area, street or building;
- answers LibanCom's fiber advertisement or broadcast, or sends a photo of a fiber box (Ministry / Ogero box, a box code like "DKW F15 078");
- says Ogero or a contractor is bringing fiber to them, that they applied for or are considering fiber (from anyone), or that neighbours are getting fiber.

fiberRequest = false when it is:
- a support problem on an existing connection — slow, down, lag, packet loss, router lights — even if the customer's line is described as "fiber" (support tickets list the connection type, e.g. "plan UP TO 5M, fiber");
- blaming Ogero for an outage or slowness, or mentioning Ogero without any interest in fiber;
- a plan / speed / billing question that is not about fiber;
- interest in NON-fiber internet.

Texts are Lebanese Arabic, Arabizi, English or French; "[Image: …]" is a description of a photo the customer sent.

"summary": one short, plain English sentence for the salesperson who will call this person — what they want or said about fiber, with the concrete details that matter (area, box code, price or speed they asked about, who else is offering them fiber). Start with a verb, no names, no "the customer". Examples: "Asks if fiber has reached Sin el Fil and what it costs." / "Sent a photo of the Ministry fiber box in the building (DKW F15 078) and wants it installed." / "Saw our fiber ad and asks if the router and installation are really free." Empty string when fiberRequest is false.`;

export async function classifyFiberInterest(input: {
	credentials: ModelCredentials;
	/** What the text is, e.g. "Customer WhatsApp message" or "Support bot escalation ticket". */
	kind: string;
	text: string;
}): Promise<FiberInterest | null> {
	return classifyText({
		systemPrompt: SYSTEM,
		userPrompt: `${input.kind}:\n${input.text.slice(0, 2000)}`,
		schema: fiberInterestSchema,
		credentials: input.credentials,
		// A yes/no on one short text: the cheapest model that reads Lebanese
		// Arabic well. OpenRouter serves Gemini Flash Lite; a direct-provider
		// key uses that provider's smallest helper.
		model:
			input.credentials.provider === "openrouter"
				? "gemini-3.1-flash-lite"
				: helperModelId(input.credentials.provider, "nano"),
		timeoutMs: 10_000,
	});
}
