import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { getSignedUploadUrl } from "@repo/storage";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

const ALLOWED_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
	"video/mp4",
	"video/webm",
	"audio/mpeg",
	"audio/ogg",
	"audio/webm",
	"audio/wav",
	"application/pdf",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"text/plain",
];

export const uploadChatAttachment = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/conversations/{conversationId}/upload",
		tags: ["AI Agents"],
		summary: "Get a signed upload URL for a chat attachment",
	})
	.input(
		z.object({
			conversationId: z.string(),
			organizationId: z.string(),
			filename: z.string().min(1).max(255),
			contentType: z.string().min(1).max(100),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const member = await verifyOrganizationMembership(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		if (!ALLOWED_MIME_TYPES.includes(input.contentType)) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Unsupported file type",
			});
		}

		const ext = input.filename.split(".").pop() ?? "bin";
		const fileId = createId();
		const storagePath = `chat-attachments/${input.organizationId}/${input.conversationId}/${fileId}.${ext}`;

		const bucket = process.env["AVATARS_BUCKET_NAME"] ?? "libancom-dev";
		const uploadUrl = await getSignedUploadUrl(storagePath, {
			bucket,
			contentType: input.contentType,
		});

		return {
			uploadUrl,
			storagePath,
		};
	});
