/** Display wording for bot follow-ups and conversation summaries. */

export const FOLLOW_UP_TYPE_LABELS: Record<string, string> = {
	silence: "Silence nudge",
	post_escalation: "Check-back",
	post_install: "Install check",
	post_stop: "After stop",
};

export const FOLLOW_UP_STATUS_LABELS: Record<string, string> = {
	pending_approval: "Awaiting approval",
	scheduled: "Scheduled",
	sending: "Sending",
	sent: "Sent",
	replied: "Replied",
	resolved: "Done",
	no_reply: "No reply",
	skipped: "Skipped",
	failed: "Failed",
	cancelled: "Cancelled",
};

export const FOLLOW_UP_OUTCOME_LABELS: Record<string, string> = {
	resolved: "Solved",
	unresolved: "Not solved",
	good: "👍 Good",
	ok: "Okay",
	bad: "👎 Problem",
	travel: "Travelling",
	moved: "Moved house",
	switched_provider: "Switched provider",
	resume: "Wants to resume",
	other: "Other",
	no_reply: "No reply",
};

export const FOLLOW_UP_SKIP_LABELS: Record<string, string> = {
	template_not_configured: "Salti template not configured",
	approval_expired: "Not approved in time",
	skipped_by_admin: "Skipped by a teammate",
	customer_active: "Customer was already talking",
	task_resolved: "Task already resolved",
	already_checked: "Already checked recently",
	weekly_cap: "Weekly cap reached",
	model_declined: "Chat showed it was solved",
	human_takeover: "A teammate took over",
	reactivated: "Customer reactivated",
	already_talked: "Customer already wrote to the bot",
	open_issue: "An open task exists",
	shared_phone: "Phone shared with another person",
	suppressed: "Opted out",
	invalid_phone: "Invalid phone",
	not_active: "Customer not active",
	interrupted: "Interrupted",
};

export const SUMMARY_OUTCOME_LABELS: Record<string, string> = {
	resolved: "✅ Resolved",
	escalated: "🔺 Escalated",
	waiting_customer: "⏳ Waiting for customer",
	waiting_team: "⏳ Waiting for team",
	sales_lead: "💼 Sales lead",
	info_only: "ℹ️ Info",
	unresolved: "❌ Unresolved",
	abandoned: "❌ Abandoned",
};

export const MOOD_LABELS: Record<string, string> = {
	satisfied: "🙂",
	neutral: "😐",
	upset: "😠",
};
