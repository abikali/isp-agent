import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { RegisteredTool, ToolContext } from "./types";

const meetingSchedulerDef = toolDefinition({
	name: "meeting-scheduler",
	description:
		"Generate a scheduling link for booking a meeting. Supports Cal.com and Calendly. Use this when the user wants to schedule a meeting or call.",
	inputSchema: z.object({
		name: z
			.string()
			.optional()
			.describe("Name of the person requesting the meeting"),
		email: z
			.string()
			.email()
			.optional()
			.describe("Email of the person requesting the meeting"),
		topic: z
			.string()
			.optional()
			.describe("Topic or reason for the meeting"),
	}),
});

function createMeetingSchedulerTool(context: ToolContext) {
	return meetingSchedulerDef.server(async (args) => {
		try {
			const provider =
				(context.toolConfig?.["provider"] as string) ?? "calcom";
			const eventSlug = context.toolConfig?.["eventSlug"] as
				| string
				| undefined;
			const username = context.toolConfig?.["username"] as
				| string
				| undefined;

			if (!username) {
				return {
					success: false,
					message:
						"Meeting scheduler is not configured. Please set up a username in the tool settings.",
				};
			}

			let schedulingUrl: string;

			if (provider === "calendly") {
				schedulingUrl = `https://calendly.com/${username}${eventSlug ? `/${eventSlug}` : ""}`;
			} else {
				schedulingUrl = `https://cal.com/${username}${eventSlug ? `/${eventSlug}` : ""}`;
			}

			// Append prefill params if available
			const params = new URLSearchParams();
			if (args.name) {
				params.set("name", args.name);
			}
			if (args.email) {
				params.set("email", args.email);
			}
			const queryString = params.toString();
			if (queryString) {
				schedulingUrl += `?${queryString}`;
			}

			const topicNote = args.topic ? ` regarding "${args.topic}"` : "";

			return {
				success: true,
				message: `Here is the scheduling link${topicNote}: ${schedulingUrl}`,
			};
		} catch (error) {
			return {
				success: false,
				message: `Failed to generate scheduling link: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	});
}

export const meetingScheduler: RegisteredTool = {
	metadata: {
		id: "meeting-scheduler",
		name: "Meeting Scheduler",
		description:
			"Generate Cal.com or Calendly scheduling links for booking meetings",
		category: "scheduling",
		requiresConfig: true,
		configFields: [
			{
				key: "provider",
				label: "Provider",
				type: "select",
				required: true,
				options: [
					{ label: "Cal.com", value: "calcom" },
					{ label: "Calendly", value: "calendly" },
				],
			},
			{
				key: "username",
				label: "Username",
				type: "text",
				required: true,
				placeholder: "your-username",
			},
			{
				key: "eventSlug",
				label: "Event Slug",
				type: "text",
				required: false,
				placeholder: "30min (optional)",
			},
		],
	},
	factory: createMeetingSchedulerTool,
};
