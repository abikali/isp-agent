"use client";

import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { Slider } from "@ui/components/slider";
import imageCompression from "browser-image-compression";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

export interface ImageCompressionOptions {
	/** Maximum file size in MB (default: 0.5) */
	maxSizeMB?: number;
	/** Maximum width or height in pixels (default: 800) */
	maxWidthOrHeight?: number;
}

interface ImageCropperProps {
	image: string;
	open: boolean;
	onClose: () => void;
	onCropComplete: (croppedImage: Blob) => void;
	aspect?: number;
	cropShape?: "rect" | "round";
	title?: string;
	/** Compression options - if provided, image will be compressed after cropping */
	compression?: ImageCompressionOptions;
}

// Extract dominant color from image for background
function getAverageColor(imageSrc: string): Promise<string> {
	return new Promise((resolve) => {
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => {
			const canvas = document.createElement("canvas");
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				resolve("rgb(0, 0, 0)");
				return;
			}

			// Sample a small version for performance
			canvas.width = 10;
			canvas.height = 10;
			ctx.drawImage(img, 0, 0, 10, 10);

			const imageData = ctx.getImageData(0, 0, 10, 10).data;
			let r = 0;
			let g = 0;
			let b = 0;

			for (let i = 0; i < imageData.length; i += 4) {
				r += imageData[i] ?? 0;
				g += imageData[i + 1] ?? 0;
				b += imageData[i + 2] ?? 0;
			}

			const pixels = imageData.length / 4;
			r = Math.round(r / pixels);
			g = Math.round(g / pixels);
			b = Math.round(b / pixels);

			resolve(`rgb(${r}, ${g}, ${b})`);
		};
		img.onerror = () => resolve("rgb(0, 0, 0)");
		img.src = imageSrc;
	});
}

// Create a blurred version of an image
function createBlurredImage(
	image: HTMLImageElement,
	blurAmount = 20,
): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");

	if (!ctx) {
		throw new Error("No 2d context");
	}

	// Use a smaller size for performance, then scale up
	const scale = 0.1;
	canvas.width = image.width * scale;
	canvas.height = image.height * scale;

	ctx.filter = `blur(${blurAmount * scale}px)`;
	ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

	// Scale back up
	const scaledCanvas = document.createElement("canvas");
	const scaledCtx = scaledCanvas.getContext("2d");

	if (!scaledCtx) {
		throw new Error("No 2d context");
	}

	scaledCanvas.width = image.width;
	scaledCanvas.height = image.height;
	scaledCtx.drawImage(canvas, 0, 0, image.width, image.height);

	return scaledCanvas;
}

async function getCroppedImg(
	imageSrc: string,
	pixelCrop: Area,
	rotation = 0,
): Promise<Blob> {
	const image = await createImage(imageSrc);
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");

	if (!ctx) {
		throw new Error("No 2d context");
	}

	const rotRad = getRadianAngle(rotation);

	// Calculate bounding box of the rotated image
	const { width: bBoxWidth, height: bBoxHeight } = rotateSize(
		image.width,
		image.height,
		rotation,
	);

	// Set canvas size to match the bounding box
	canvas.width = bBoxWidth;
	canvas.height = bBoxHeight;

	// Translate canvas context to center to allow rotating and flipping around the center
	ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
	ctx.rotate(rotRad);
	ctx.translate(-image.width / 2, -image.height / 2);

	// Draw the rotated image
	ctx.drawImage(image, 0, 0);

	// Extract the cropped image from the rotated canvas
	const croppedCanvas = document.createElement("canvas");
	const croppedCtx = croppedCanvas.getContext("2d");

	if (!croppedCtx) {
		throw new Error("No 2d context");
	}

	// Set the size of the cropped canvas
	croppedCanvas.width = pixelCrop.width;
	croppedCanvas.height = pixelCrop.height;

	// Check if crop extends beyond image bounds (zoom out scenario)
	const needsBackground =
		pixelCrop.x < 0 ||
		pixelCrop.y < 0 ||
		pixelCrop.x + pixelCrop.width > bBoxWidth ||
		pixelCrop.y + pixelCrop.height > bBoxHeight;

	if (needsBackground) {
		// Create blurred background
		const blurredImage = createBlurredImage(image);

		// Create a blurred rotated canvas
		const blurredCanvas = document.createElement("canvas");
		const blurredCtx = blurredCanvas.getContext("2d");

		if (blurredCtx) {
			blurredCanvas.width = bBoxWidth;
			blurredCanvas.height = bBoxHeight;
			blurredCtx.translate(bBoxWidth / 2, bBoxHeight / 2);
			blurredCtx.rotate(rotRad);
			blurredCtx.translate(-image.width / 2, -image.height / 2);
			blurredCtx.drawImage(blurredImage, 0, 0);

			// Fill cropped canvas with blurred background (scaled to fill)
			const scaleX = pixelCrop.width / bBoxWidth;
			const scaleY = pixelCrop.height / bBoxHeight;
			const bgScale = Math.max(scaleX, scaleY) * 1.2;

			const bgWidth = bBoxWidth * bgScale;
			const bgHeight = bBoxHeight * bgScale;
			const bgX = (pixelCrop.width - bgWidth) / 2;
			const bgY = (pixelCrop.height - bgHeight) / 2;

			croppedCtx.drawImage(blurredCanvas, bgX, bgY, bgWidth, bgHeight);
		}
	}

	// Draw the cropped image on top
	croppedCtx.drawImage(
		canvas,
		pixelCrop.x,
		pixelCrop.y,
		pixelCrop.width,
		pixelCrop.height,
		0,
		0,
		pixelCrop.width,
		pixelCrop.height,
	);

	// Return as blob
	return new Promise((resolve, reject) => {
		croppedCanvas.toBlob(
			(blob) => {
				if (blob) {
					resolve(blob);
				} else {
					reject(new Error("Canvas is empty"));
				}
			},
			"image/jpeg",
			0.9,
		);
	});
}

function createImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.addEventListener("load", () => resolve(image));
		image.addEventListener("error", (error) => reject(error));
		image.crossOrigin = "anonymous";
		image.src = url;
	});
}

function getRadianAngle(degreeValue: number): number {
	return (degreeValue * Math.PI) / 180;
}

function rotateSize(
	width: number,
	height: number,
	rotation: number,
): { width: number; height: number } {
	const rotRad = getRadianAngle(rotation);
	return {
		width:
			Math.abs(Math.cos(rotRad) * width) +
			Math.abs(Math.sin(rotRad) * height),
		height:
			Math.abs(Math.sin(rotRad) * width) +
			Math.abs(Math.cos(rotRad) * height),
	};
}

/**
 * Compress a blob using browser-image-compression
 */
async function compressImage(
	blob: Blob,
	options: ImageCompressionOptions,
): Promise<Blob> {
	const { maxSizeMB = 0.5, maxWidthOrHeight = 800 } = options;

	// Convert blob to File (required by browser-image-compression)
	const file = new File([blob], "image.jpg", { type: blob.type });

	const compressionOptions = {
		maxSizeMB,
		maxWidthOrHeight,
		useWebWorker: true,
		fileType: "image/jpeg" as const,
	};

	const compressedFile = await imageCompression(file, compressionOptions);

	return compressedFile;
}

export function ImageCropper({
	image,
	open,
	onClose,
	onCropComplete,
	aspect = 1,
	cropShape = "round",
	title = "Crop Image",
	compression,
}: ImageCropperProps) {
	const [crop, setCrop] = useState({ x: 0, y: 0 });
	const [zoom, setZoom] = useState(1);
	const [rotation, setRotation] = useState(0);
	const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(
		null,
	);
	const [isProcessing, setIsProcessing] = useState(false);
	const [bgColor, setBgColor] = useState("rgb(0, 0, 0)");

	// Extract dominant color when image changes
	useEffect(() => {
		if (image) {
			getAverageColor(image).then(setBgColor);
		}
	}, [image]);

	const onCropCompleteHandler = useCallback(
		(_croppedArea: Area, croppedAreaPixels: Area) => {
			setCroppedAreaPixels(croppedAreaPixels);
		},
		[],
	);

	const handleSave = useCallback(async () => {
		if (!croppedAreaPixels) {
			return;
		}

		setIsProcessing(true);
		try {
			let croppedImage = await getCroppedImg(
				image,
				croppedAreaPixels,
				rotation,
			);

			// Apply compression if options provided
			if (compression) {
				croppedImage = await compressImage(croppedImage, compression);
			}

			onCropComplete(croppedImage);
			onClose();
		} catch (_error) {
			// Cropping failed silently - UI remains unchanged
		} finally {
			setIsProcessing(false);
		}
	}, [
		croppedAreaPixels,
		image,
		rotation,
		onCropComplete,
		onClose,
		compression,
	]);

	const handleReset = useCallback(() => {
		setCrop({ x: 0, y: 0 });
		setZoom(1);
		setRotation(0);
	}, []);

	return (
		<Dialog open={open} onOpenChange={(open) => !open && onClose()}>
			<DialogContent
				className="max-w-md sm:max-w-lg"
				accessibleDescription="Use the controls below to adjust zoom and rotation. Drag the image to reposition it within the crop area."
			>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>

				<div
					className="relative h-64 w-full overflow-hidden rounded-lg"
					role="application"
					aria-label="Image crop area. Drag to reposition, use sliders below to zoom and rotate."
				>
					{/* Blurred background layer */}
					<div
						className="absolute inset-0 scale-110"
						style={{
							backgroundImage: `url(${image})`,
							backgroundSize: "cover",
							backgroundPosition: "center",
							filter: "blur(20px)",
							backgroundColor: bgColor,
						}}
						aria-hidden="true"
					/>
					{/* Cropper */}
					<Cropper
						image={image}
						crop={crop}
						zoom={zoom}
						rotation={rotation}
						aspect={aspect}
						cropShape={cropShape}
						showGrid={false}
						onCropChange={setCrop}
						onZoomChange={setZoom}
						onRotationChange={setRotation}
						onCropComplete={onCropCompleteHandler}
						minZoom={0.5}
						maxZoom={3}
						restrictPosition={false}
						style={{
							containerStyle: {
								backgroundColor: "transparent",
							},
						}}
					/>
				</div>

				<div className="space-y-4">
					{/* Zoom control */}
					<div className="flex items-center gap-3">
						<Minus
							className="size-4 text-muted-foreground"
							aria-hidden="true"
						/>
						<Slider
							value={[zoom]}
							min={0.5}
							max={3}
							step={0.1}
							onValueChange={([value]) => {
								if (value !== undefined) {
									setZoom(value);
								}
							}}
							className="flex-1"
							aria-label={`Zoom level: ${Math.round(zoom * 100)}%`}
						/>
						<Plus
							className="size-4 text-muted-foreground"
							aria-hidden="true"
						/>
					</div>

					{/* Rotation control */}
					<div className="flex items-center gap-3">
						<RotateCcw
							className="size-4 text-muted-foreground"
							aria-hidden="true"
						/>
						<Slider
							value={[rotation]}
							min={0}
							max={360}
							step={1}
							onValueChange={([value]) => {
								if (value !== undefined) {
									setRotation(value);
								}
							}}
							className="flex-1"
							aria-label={`Rotation: ${rotation} degrees`}
						/>
						<span
							className="w-10 text-right text-xs text-muted-foreground"
							aria-hidden="true"
						>
							{rotation}°
						</span>
					</div>
				</div>

				<DialogFooter className="gap-2 sm:gap-0">
					<Button
						type="button"
						variant="outline"
						onClick={handleReset}
					>
						Reset
					</Button>
					<Button type="button" variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={handleSave}
						disabled={isProcessing}
					>
						{isProcessing ? "Processing..." : "Apply"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
