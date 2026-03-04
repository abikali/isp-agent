"use client";

import { orpcClient } from "@shared/lib/orpc";
import { useCallback, useState } from "react";

interface UploadResult {
	storagePath: string;
}

export function useAttachmentUpload() {
	const [isUploading, setIsUploading] = useState(false);
	const [progress, setProgress] = useState(0);

	const upload = useCallback(
		async (
			file: File,
			conversationId: string,
			organizationId: string,
		): Promise<UploadResult> => {
			setIsUploading(true);
			setProgress(0);

			try {
				// Get signed URL
				const { uploadUrl, storagePath } =
					await orpcClient.aiAgents.uploadChatAttachment({
						conversationId,
						organizationId,
						filename: file.name,
						contentType: file.type,
					});

				setProgress(30);

				// Upload to R2
				await fetch(uploadUrl, {
					method: "PUT",
					body: file,
					headers: {
						"Content-Type": file.type,
					},
				});

				setProgress(100);
				return { storagePath };
			} finally {
				setIsUploading(false);
			}
		},
		[],
	);

	return { upload, isUploading, progress };
}
