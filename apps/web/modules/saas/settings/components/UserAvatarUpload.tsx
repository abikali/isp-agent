"use client";

import { authClient } from "@repo/auth/client";
import { useSession } from "@saas/auth/client";
import { ImageCropper } from "@shared/components/ImageCropper";
import { Spinner } from "@shared/components/Spinner";
import { UserAvatar } from "@shared/components/UserAvatar";
import { orpc } from "@shared/lib/orpc";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";

export function UserAvatarUpload({
	onSuccess,
	onError,
}: {
	onSuccess: () => void;
	onError: () => void;
}) {
	const { user, reloadSession } = useSession();
	const [uploading, setUploading] = useState(false);
	const [cropDialogOpen, setCropDialogOpen] = useState(false);
	const [imageUrl, setImageUrl] = useState<string | null>(null);

	// Clean up object URL when component unmounts or image changes
	useEffect(() => {
		return () => {
			if (imageUrl) {
				URL.revokeObjectURL(imageUrl);
			}
		};
	}, [imageUrl]);

	const getSignedUploadUrlMutation = useMutation(
		orpc.users.avatarUploadUrl.mutationOptions(),
	);

	const { getRootProps, getInputProps } = useDropzone({
		onDrop: (acceptedFiles) => {
			const file = acceptedFiles[0];
			if (file) {
				// Clean up previous URL if exists
				if (imageUrl) {
					URL.revokeObjectURL(imageUrl);
				}
				setImageUrl(URL.createObjectURL(file));
				setCropDialogOpen(true);
			}
		},
		accept: {
			"image/png": [".png"],
			"image/jpeg": [".jpg", ".jpeg"],
		},
		multiple: false,
	});

	if (!user) {
		return null;
	}

	const onCropComplete = async (croppedImageData: Blob) => {
		setUploading(true);
		try {
			const { signedUploadUrl, path } =
				await getSignedUploadUrlMutation.mutateAsync({});

			const response = await fetch(signedUploadUrl, {
				method: "PUT",
				body: croppedImageData,
				headers: {
					"Content-Type": "image/png",
				},
			});

			if (!response.ok) {
				throw new Error("Failed to upload image");
			}

			const { error } = await authClient.updateUser({
				image: path,
			});

			if (error) {
				throw error;
			}

			await reloadSession();

			onSuccess();
		} catch {
			onError();
		} finally {
			setUploading(false);
		}
	};

	return (
		<>
			<div className="relative size-24 rounded-full" {...getRootProps()}>
				<input {...getInputProps()} />
				<UserAvatar
					className="size-24 cursor-pointer text-xl"
					avatarUrl={user.image}
					name={user.name ?? ""}
				/>

				{uploading && (
					<div className="absolute inset-0 z-20 flex items-center justify-center bg-card/90">
						<Spinner className="size-6" />
					</div>
				)}
			</div>

			{imageUrl && (
				<ImageCropper
					image={imageUrl}
					open={cropDialogOpen}
					onClose={() => setCropDialogOpen(false)}
					onCropComplete={onCropComplete}
					aspect={1}
					cropShape="round"
					title="Crop Avatar"
					compression={{ maxSizeMB: 0.2, maxWidthOrHeight: 400 }}
				/>
			)}
		</>
	);
}
