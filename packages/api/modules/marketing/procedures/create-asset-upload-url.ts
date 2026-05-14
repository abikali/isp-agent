import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { requirePermission } from "@repo/api/lib/permission";
import { config } from "@repo/config";
import { getSignedUploadUrl } from "@repo/storage";
import { getBaseUrl } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/** Allowed MIME types for WhatsApp template header media. */
const ALLOWED_MIME_TYPES = new Set([
	// IMAGE
	"image/jpeg",
	"image/png",
	"image/webp",
	// VIDEO
	"video/mp4",
	"video/3gpp",
	// DOCUMENT
	"application/pdf",
]);

function isAllowedMimeType(contentType: string): boolean {
	const base = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
	return ALLOWED_MIME_TYPES.has(base);
}

/**
 * Returns a signed PUT URL for uploading a marketing asset to R2. The
 * caller uploads directly to R2, then submits `publicUrl` to the broadcast
 * as the template's header media URL. `publicUrl` points at this app's
 * `/image-proxy/{bucket}/{path}` route — WhatsApp/Salti dereference it at
 * send-time, which 302-redirects to a fresh signed GET, so the asset stays
 * private at rest.
 */
export const createAssetUploadUrl = protectedProcedure
	.route({
		method: "POST",
		path: "/marketing/assets/upload-url",
		tags: ["Marketing"],
		summary: "Get a signed upload URL for a marketing asset",
	})
	.input(
		z.object({
			organizationId: z.string(),
			filename: z.string().min(1).max(255),
			contentType: z.string().min(1).max(100),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"marketing",
			"send",
		);

		if (!isAllowedMimeType(input.contentType)) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"Unsupported file type. WhatsApp supports JPG/PNG/WEBP images, MP4/3GPP video, and PDF documents.",
			});
		}

		const ext = input.filename.includes(".")
			? (input.filename.split(".").pop() ?? "bin")
			: "bin";
		const fileId = createId();
		const storagePath = `marketing-assets/${input.organizationId}/${fileId}.${ext}`;

		const bucket = config.storage.bucketNames.avatars;
		const uploadUrl = await getSignedUploadUrl(storagePath, {
			bucket,
			contentType: input.contentType,
		});

		const publicUrl = `${getBaseUrl()}/image-proxy/${bucket}/${storagePath
			.split("/")
			.map((s) => encodeURIComponent(s))
			.join("/")}`;

		return {
			uploadUrl,
			storagePath,
			bucket,
			publicUrl,
		};
	});
