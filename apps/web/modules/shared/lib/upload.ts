/**
 * PUT a file to a signed upload URL with progress callbacks.
 * Used for marketing assets, expense receipts, and task evidence photos.
 */
export function uploadWithProgress(
	url: string,
	file: File,
	onProgress: (percent: number) => void,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open("PUT", url);
		xhr.setRequestHeader("Content-Type", file.type);
		xhr.upload.addEventListener("progress", (e) => {
			if (e.lengthComputable) {
				onProgress(Math.round((e.loaded / e.total) * 100));
			}
		});
		xhr.addEventListener("load", () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				resolve();
			} else {
				reject(new Error(`Upload failed (HTTP ${xhr.status})`));
			}
		});
		xhr.addEventListener("error", () => {
			reject(new Error("Network error during upload"));
		});
		xhr.addEventListener("abort", () => {
			reject(new Error("Upload aborted"));
		});
		xhr.send(file);
	});
}
