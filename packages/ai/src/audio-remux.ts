import { PassThrough, Readable } from "node:stream";
import { logger } from "@repo/logs";
import ffmpegStatic from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";

if (ffmpegStatic) {
	ffmpeg.setFfmpegPath(ffmpegStatic);
}

/**
 * Remux a WebM/Opus audio buffer to OGG/Opus without re-encoding.
 * This is a lossless container swap (same Opus codec, different container)
 * and completes in milliseconds.
 *
 * WhatsApp requires audio in OGG/Opus, AAC, MP3, or AMR format.
 * Browsers record in WebM/Opus (Chrome) which WhatsApp can't play.
 */
export async function remuxWebmToOgg(webmBuffer: Buffer): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const input = Readable.from(webmBuffer);
		const chunks: Buffer[] = [];
		const output = new PassThrough();

		output.on("data", (chunk: Buffer) => chunks.push(chunk));
		output.on("end", () => resolve(Buffer.concat(chunks)));
		output.on("error", reject);

		ffmpeg(input)
			.inputFormat("webm")
			.audioCodec("copy") // no re-encoding — just repackage
			.format("ogg")
			.on("error", (err: Error) => {
				logger.error("FFmpeg remux failed", { error: err.message });
				reject(err);
			})
			.pipe(output, { end: true });
	});
}

/**
 * Check if a MIME type needs remuxing for WhatsApp compatibility.
 */
export function needsAudioRemux(mimeType: string): boolean {
	const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
	// WebM audio needs remuxing — OGG, MP3, AAC, WAV are fine
	return base === "audio/webm";
}
