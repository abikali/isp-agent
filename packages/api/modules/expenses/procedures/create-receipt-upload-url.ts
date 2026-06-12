import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { requirePermission } from "@repo/api/lib/permission";
import { config } from "@repo/config";
import { getSignedUploadUrl } from "@repo/storage";
import { getBaseUrl } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function isAllowedMimeType(contentType: string): boolean {
	const base = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
	return ALLOWED_MIME_TYPES.has(base);
}

export const createReceiptUploadUrl = protectedProcedure
	.route({
		method: "POST",
		path: "/expenses/receipt-upload-url",
		tags: ["Expenses"],
		summary: "Get a signed upload URL for an expense receipt photo",
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
			"expenses",
			"create",
		);

		if (!isAllowedMimeType(input.contentType)) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Receipts must be JPG, PNG, or WEBP images",
			});
		}

		const ext = input.filename.includes(".")
			? (input.filename.split(".").pop() ?? "jpg")
			: "jpg";
		const fileId = createId();
		const storagePath = `expenses/${input.organizationId}/${fileId}.${ext}`;

		const bucket = config.storage.bucketNames.avatars;
		const uploadUrl = await getSignedUploadUrl(storagePath, {
			bucket,
			contentType: input.contentType,
		});

		const publicUrl = `${getBaseUrl()}/image-proxy/${bucket}/${storagePath
			.split("/")
			.map((s) => encodeURIComponent(s))
			.join("/")}`;

		return { uploadUrl, storagePath, bucket, publicUrl };
	});
