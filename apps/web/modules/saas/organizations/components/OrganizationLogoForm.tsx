"use client";

import { authClient } from "@repo/auth/client";
import { organizationsQueryKeys } from "@saas/organizations/lib/api";
import { SettingsItem } from "@saas/shared/client";
import { ImageCropper } from "@shared/components/ImageCropper";
import { Spinner } from "@shared/components/Spinner";
import { orpc } from "@shared/lib/orpc";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { useActiveOrganization } from "../hooks/use-active-organization";
import { OrganizationLogo } from "./OrganizationLogo";

export function OrganizationLogoForm() {
	const [uploading, setUploading] = useState(false);
	const [cropDialogOpen, setCropDialogOpen] = useState(false);
	const [imageUrl, setImageUrl] = useState<string | null>(null);
	const { activeOrganization, refetchActiveOrganization } =
		useActiveOrganization();
	const queryClient = useQueryClient();
	const getSignedUploadUrlMutation = useMutation(
		orpc.organizations.createLogoUploadUrl.mutationOptions(),
	);

	// Clean up object URL when component unmounts or image changes
	useEffect(() => {
		return () => {
			if (imageUrl) {
				URL.revokeObjectURL(imageUrl);
			}
		};
	}, [imageUrl]);

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

	if (!activeOrganization) {
		return null;
	}

	const onCropComplete = async (croppedImageData: Blob) => {
		setUploading(true);
		try {
			const { signedUploadUrl, path } =
				await getSignedUploadUrlMutation.mutateAsync({
					organizationId: activeOrganization.id,
				});

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

			// Update organization logo
			const { error } = await authClient.organization.update({
				organizationId: activeOrganization.id,
				data: {
					logo: path,
				},
			});

			if (error) {
				throw error;
			}

			toast.success("Logo uploaded successfully");

			refetchActiveOrganization();
			queryClient.invalidateQueries({
				queryKey: organizationsQueryKeys.list(),
			});
		} catch {
			toast.error("Failed to upload logo");
		} finally {
			setUploading(false);
		}
	};

	return (
		<SettingsItem
			title="Organization Logo"
			description="Upload and manage your organization's logo"
		>
			<div className="relative size-24 rounded-full" {...getRootProps()}>
				<input {...getInputProps()} />
				<OrganizationLogo
					className="size-24 cursor-pointer text-xl"
					logoUrl={activeOrganization.logo}
					name={activeOrganization.name ?? ""}
				/>

				{uploading && (
					<div className="absolute inset-0 z-20 flex items-center justify-center bg-card/90">
						<Spinner />
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
					title="Crop Logo"
					compression={{ maxSizeMB: 0.1, maxWidthOrHeight: 200 }}
				/>
			)}
		</SettingsItem>
	);
}
