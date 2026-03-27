import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { requirePermission } from "@repo/api/lib/permission";
import { getSignedUploadUrl } from "@repo/storage";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/** Allowed base MIME types for chat attachments (without parameters like ;codecs=opus) */
const ALLOWED_MIME_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
	"image/heic",
	"image/heif",
	"video/mp4",
	"video/webm",
	"video/quicktime",
	"audio/mpeg",
	"audio/mp4",
	"audio/aac",
	"audio/ogg",
	"audio/webm",
	"audio/wav",
	"audio/x-m4a",
	"application/pdf",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"text/plain",
]);

function isAllowedMimeType(contentType: string): boolean {
	// Strip parameters like ";codecs=opus" — browsers include these
	const base = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
	return ALLOWED_MIME_TYPES.has(base);
}

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
		await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"update",
		);

		if (!isAllowedMimeType(input.contentType)) {
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
