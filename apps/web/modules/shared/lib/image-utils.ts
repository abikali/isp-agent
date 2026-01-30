import { config } from "@repo/config";

const avatarsBucket = config.storage.bucketNames.avatars;

/**
 * Converts a storage path or URL to a proper image URL.
 *
 * Storage paths like "profiles/xxx/cover.jpg" are converted to "/image-proxy/avatars/profiles/xxx/cover.jpg"
 * Full URLs (http/https) are returned as-is.
 * Null/undefined values return null.
 *
 * @param path - The storage path or URL
 * @param bucket - Optional bucket name (defaults to avatars bucket)
 * @returns A valid image URL or null
 */
export function getStorageImageUrl(
	path: string | null | undefined,
	bucket: string = avatarsBucket,
): string | null {
	if (!path) {
		return null;
	}

	// Already a full URL - return as-is
	if (path.startsWith("http://") || path.startsWith("https://")) {
		return path;
	}

	// Already a proper path starting with /
	if (path.startsWith("/")) {
		return path;
	}

	// Convert storage path to image proxy URL
	return `/image-proxy/${bucket}/${path}`;
}

/**
 * Converts a storage path to a CSS-safe background-image URL.
 * Returns undefined if no path is provided.
 *
 * @param path - The storage path or URL
 * @param bucket - Optional bucket name (defaults to avatars bucket)
 * @returns A url() string for CSS or undefined
 */
export function getStorageBackgroundUrl(
	path: string | null | undefined,
	bucket: string = avatarsBucket,
): string | undefined {
	const url = getStorageImageUrl(path, bucket);
	return url ? `url(${url})` : undefined;
}
