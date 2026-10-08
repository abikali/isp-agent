/**
 * Fiber control room vocabulary. Browser-safe (no server imports): the web
 * app reads labels and stage order from here.
 */

export const FIBER_STAGES = [
	"NEW",
	"CONTACTED",
	"INTERESTED",
	"BOX_CHECK",
	"SUBMITTED",
	"INSTALLING",
	"WON",
	"LOST",
] as const;
export type FiberStage = (typeof FIBER_STAGES)[number];

/** Stages still in play — everything except WON / LOST. */
export const OPEN_FIBER_STAGES = FIBER_STAGES.filter(
	(s) => s !== "WON" && s !== "LOST",
);

export const FIBER_STAGE_LABELS: Record<FiberStage, string> = {
	NEW: "New",
	CONTACTED: "Contacted",
	INTERESTED: "Interested",
	BOX_CHECK: "Box check",
	SUBMITTED: "Sent to Ogero",
	INSTALLING: "Installing",
	WON: "Won",
	LOST: "Lost",
};

/** What to do while a lead sits in each stage. */
export const FIBER_STAGE_HINTS: Record<FiberStage, string> = {
	NEW: "Nobody has talked to them yet. Call or WhatsApp them about the fiber offer.",
	CONTACTED:
		"We reached out. Wait for their answer — follow up if they go quiet.",
	INTERESTED:
		"They want fiber. Ask for a photo of the fiber box in their building, or send someone to check.",
	BOX_CHECK:
		"Confirm the box and write its code below, then file the request on the Ogero portal.",
	SUBMITTED:
		"The request is with Ogero. Write the request number below and wait for approval.",
	INSTALLING: "Approved. Schedule the installation and get them online.",
	WON: "Live on LibanCom fiber.",
	LOST: "Closed — they left or aren't interested.",
};

/** The button that moves a lead forward, worded as what just happened. */
export const FIBER_NEXT_STEP: Record<
	Exclude<FiberStage, "WON" | "LOST">,
	{ label: string; to: FiberStage }
> = {
	NEW: { label: "I reached them", to: "CONTACTED" },
	CONTACTED: { label: "They're interested", to: "INTERESTED" },
	INTERESTED: { label: "Asked for the box photo", to: "BOX_CHECK" },
	BOX_CHECK: { label: "Box confirmed — sent to Ogero", to: "SUBMITTED" },
	SUBMITTED: { label: "Approved — installation booked", to: "INSTALLING" },
	INSTALLING: { label: "Installed — they're online", to: "WON" },
};

export const FIBER_LOST_REASONS = [
	"OGERO",
	"OTHER_ISP",
	"NO_BOX",
	"PRICE",
	"NOT_INTERESTED",
	"UNREACHABLE",
	"OTHER",
] as const;
export type FiberLostReason = (typeof FIBER_LOST_REASONS)[number];

export const FIBER_LOST_REASON_LABELS: Record<FiberLostReason, string> = {
	OGERO: "Took Ogero",
	OTHER_ISP: "Another provider",
	NO_BOX: "No fiber box",
	PRICE: "Price",
	NOT_INTERESTED: "Not interested",
	UNREACHABLE: "Unreachable",
	OTHER: "Other",
};

export const FIBER_SOURCES = [
	"BOT",
	"CHURN",
	"ESCALATION",
	"BROADCAST",
	"COLLECTOR",
	"CUSTOMER_BASE",
	"MANUAL",
] as const;
export type FiberSource = (typeof FIBER_SOURCES)[number];

/** How the lead reached us, in words an admin would use. */
export const FIBER_SOURCE_LABELS: Record<FiberSource, string> = {
	BOT: "Asked the bot",
	CHURN: "Stopped service",
	ESCALATION: "Bot ticket",
	BROADCAST: "Replied to broadcast",
	COLLECTOR: "From a collector",
	CUSTOMER_BASE: "At-risk list",
	MANUAL: "Added by staff",
};

export const FIBER_BOX_STATUSES = [
	"UNKNOWN",
	"NO_BOX",
	"BOX_IN_BUILDING",
] as const;
export type FiberBoxStatus = (typeof FIBER_BOX_STATUSES)[number];

export const FIBER_BOX_LABELS: Record<FiberBoxStatus, string> = {
	UNKNOWN: "Not checked",
	NO_BOX: "No box",
	BOX_IN_BUILDING: "Box in building",
};

export const FIBER_AREA_STATUSES = ["NONE", "ROLLOUT", "LIVE"] as const;
export type FiberAreaStatus = (typeof FIBER_AREA_STATUSES)[number];

export const FIBER_AREA_LABELS: Record<FiberAreaStatus, string> = {
	NONE: "No fiber yet",
	ROLLOUT: "Boxes going in",
	LIVE: "Fiber live",
};

/** Why a customer is on the defend list — shown as chips, not a bare score. */
export const FIBER_RISK_REASONS = [
	"FIBER_AREA",
	"OGERO_APPROACHED",
	"ASKED_FIBER",
	"HAS_LANDLINE",
] as const;
export type FiberRiskReason = (typeof FIBER_RISK_REASONS)[number];

export const FIBER_RISK_LABELS: Record<FiberRiskReason, string> = {
	FIBER_AREA: "Fiber area",
	OGERO_APPROACHED: "Ogero approached",
	ASKED_FIBER: "Asked about fiber",
	HAS_LANDLINE: "Has landline",
};

export const FIBER_RISK_WEIGHTS: Record<FiberRiskReason, number> = {
	OGERO_APPROACHED: 4,
	FIBER_AREA: 3,
	ASKED_FIBER: 2,
	HAS_LANDLINE: 2,
};

/** Score at which a customer counts as "at risk". */
export const FIBER_RISK_THRESHOLD = 3;
