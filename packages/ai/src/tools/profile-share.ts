import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { RegisteredTool, ToolContext } from "./types";

const profileShareDef = toolDefinition({
	name: "profile-share",
	description:
		"Share the organization's profile URL or generate a vCard text for the contact. Use this when the user asks for a profile link, business card, or contact information for the organization.",
	inputSchema: z.object({
		format: z
			.enum(["url", "vcard"])
			.default("url")
			.describe(
				"The format to share: 'url' for a profile link, 'vcard' for contact card text",
			),
	}),
});

function createProfileShareTool(context: ToolContext) {
	return profileShareDef.server(async (args) => {
		try {
			const { db } = await import("@repo/database");

			const organization = await db.organization.findUnique({
				where: { id: context.organizationId },
				select: { name: true, slug: true },
			});

			if (!organization?.slug) {
				return {
					success: false,
					message:
						"This organization does not have a public profile configured.",
				};
			}

			const baseUrl =
				process.env["APP_URL"] ?? "https://app.libancom.com";
			const profileUrl = `${baseUrl}/v/${organization.slug}`;

			if (args.format === "vcard") {
				const vcard = [
					"BEGIN:VCARD",
					"VERSION:3.0",
					`FN:${organization.name}`,
					`ORG:${organization.name}`,
					`URL:${profileUrl}`,
					"END:VCARD",
				].join("\n");

				return {
					success: true,
					message: `Here is the vCard for ${organization.name}:\n\n${vcard}`,
				};
			}

			return {
				success: true,
				message: `Here is the profile link for ${organization.name}: ${profileUrl}`,
			};
		} catch (error) {
			return {
				success: false,
				message: `Failed to retrieve profile: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	});
}

export const profileShare: RegisteredTool = {
	metadata: {
		id: "profile-share",
		name: "Profile Share",
		description:
			"Share the organization's public profile URL or vCard with contacts",
		category: "networking",
		requiresConfig: false,
	},
	factory: createProfileShareTool,
};
