import z from "zod";

// A little slack so a time picked "now-ish" in the browser isn't rejected by
// the few seconds it takes to submit.
const PAST_TOLERANCE_MS = 5 * 60_000;
const MAX_LEAD_DAYS = 60;

export const scheduledAtSchema = z.coerce
	.date()
	.refine((d) => d.getTime() >= Date.now() - PAST_TOLERANCE_MS, {
		message: "Scheduled time is in the past.",
	})
	.refine((d) => d.getTime() <= Date.now() + MAX_LEAD_DAYS * 86_400_000, {
		message: `Broadcasts can be scheduled at most ${MAX_LEAD_DAYS} days ahead.`,
	});
