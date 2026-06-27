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
	// Encode each path segment to handle special characters (e.g. semicolons from MIME params)
	const encodedPath = path
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");
	return `/image-proxy/${bucket}/${encodedPath}`;
}
