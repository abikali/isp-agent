/**
 * Debug script to test Whapi media download.
 *
 * Usage: pnpm --filter @repo/scripts debug:media
 *
 * Phase 1: Restart channel, clear empty media cache
 * Phase 2: Wait for a new voice message and test download
 */

import { createDecipheriv } from "node:crypto";
import { db } from "@repo/database";

const WHAPI_BASE_URL = "https://gate.whapi.cloud";

function decryptToken(encrypted: string): string {
	const keyHex = process.env["AI_CHANNEL_ENCRYPTION_KEY"];
	if (!keyHex) {
		throw new Error("AI_CHANNEL_ENCRYPTION_KEY not set");
	}
	const key = Buffer.from(keyHex, "hex");
	const [ivB64, authTagB64, dataB64] = encrypted.split(":");
	if (!ivB64 || !authTagB64 || !dataB64) {
		throw new Error("Invalid encrypted token format");
	}
	const iv = Buffer.from(ivB64, "base64");
	const authTag = Buffer.from(authTagB64, "base64");
	const data = Buffer.from(dataB64, "base64");
	const decipher = createDecipheriv("aes-256-gcm", key, iv, {
		authTagLength: 16,
	});
	decipher.setAuthTag(authTag);
	return Buffer.concat([decipher.update(data), decipher.final()]).toString(
		"utf8",
	);
}

function log(label: string) {
	process.stdout.write(`\n${"=".repeat(60)}\n`);
	process.stdout.write(`[${label}]\n`);
}

async function main() {
	try {
		// Find the active WhatsApp channel
		const channel = await db.aiAgentChannel.findFirst({
			where: { provider: "whatsapp", enabled: true },
			include: { agent: true },
			orderBy: { lastActivityAt: "desc" },
		});

		if (!channel) {
			process.stderr.write("No enabled WhatsApp channel found\n");
			return;
		}

		const apiToken = decryptToken(channel.encryptedApiToken);
		process.stdout.write(`Channel: ${channel.name} (${channel.id})\n`);

		// Step 1: Check current health
		log("STEP 1: Current health");
		const healthRes = await fetch(`${WHAPI_BASE_URL}/health`, {
			headers: { Authorization: `Bearer ${apiToken}` },
		});
		const health = (await healthRes.json()) as Record<string, unknown>;
		const status = health["status"] as Record<string, unknown>;
		process.stdout.write(
			`  Status: ${status?.["text"]} (code ${status?.["code"]})\n`,
		);
		process.stdout.write(`  Uptime: ${health["uptime"]}s\n`);

		// Step 2: Restart the channel via POST /health
		log("STEP 2: Restarting channel via POST /health");
		const launchRes = await fetch(`${WHAPI_BASE_URL}/health`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiToken}`,
				"Content-Type": "application/json",
			},
		});
		process.stdout.write(`  POST /health status: ${launchRes.status}\n`);
		const launchBody = await launchRes.text();
		process.stdout.write(`  Response: ${launchBody}\n`);

		// Wait for channel to restart
		process.stdout.write("  Waiting 20s for channel to fully restart...\n");
		await new Promise((r) => setTimeout(r, 20000));

		// Check new health
		const newHealthRes = await fetch(`${WHAPI_BASE_URL}/health`, {
			headers: { Authorization: `Bearer ${apiToken}` },
		});
		const newHealth = (await newHealthRes.json()) as Record<
			string,
			unknown
		>;
		const newStatus = newHealth["status"] as Record<string, unknown>;
		process.stdout.write(
			`  New status: ${newStatus?.["text"]} (code ${newStatus?.["code"]})\n`,
		);
		process.stdout.write(
			`  New uptime: ${newHealth["uptime"]}s (was ${health["uptime"]}s)\n`,
		);

		// Step 3: Delete all empty cached media
		log("STEP 3: Clearing empty cached media files");
		const mediaListRes = await fetch(`${WHAPI_BASE_URL}/media?count=50`, {
			headers: { Authorization: `Bearer ${apiToken}` },
		});
		if (mediaListRes.ok) {
			const mediaList = (await mediaListRes.json()) as {
				files?: Array<{ id: string; link?: string }>;
				total?: number;
			};
			process.stdout.write(`  Total media files: ${mediaList.total}\n`);
			let deleted = 0;
			for (const f of mediaList.files ?? []) {
				if (f.link) {
					const testRes = await fetch(f.link);
					const testBuf = Buffer.from(await testRes.arrayBuffer());
					if (testBuf.length === 0) {
						await fetch(`${WHAPI_BASE_URL}/media/${f.id}`, {
							method: "DELETE",
							headers: {
								Authorization: `Bearer ${apiToken}`,
							},
						});
						deleted++;
					}
				}
			}
			process.stdout.write(
				`  Deleted ${deleted} empty cached media files\n`,
			);
		}

		// Step 4: Verify auto_download settings
		log("STEP 4: Verify auto_download settings");
		const settingsRes = await fetch(`${WHAPI_BASE_URL}/settings`, {
			headers: { Authorization: `Bearer ${apiToken}` },
		});
		const settings = (await settingsRes.json()) as Record<string, unknown>;
		const media = settings["media"] as Record<string, unknown>;
		process.stdout.write(
			`  auto_download: ${JSON.stringify(media?.["auto_download"])}\n`,
		);

		// Step 5: Wait for user to send a voice message, then test
		log("STEP 5: Waiting for a NEW voice message...");
		process.stdout.write(
			"  Send a voice message to the WhatsApp number now.\n",
		);
		process.stdout.write("  Polling every 5s for new media...\n\n");

		const existingMediaRes = await fetch(
			`${WHAPI_BASE_URL}/media?count=50`,
			{ headers: { Authorization: `Bearer ${apiToken}` } },
		);
		const existingMedia = (await existingMediaRes.json()) as {
			files?: Array<{ id: string }>;
		};
		const existingIds = new Set(
			(existingMedia.files ?? []).map((f) => f.id),
		);

		// Poll for new media (max 120 seconds)
		let newMediaId: string | null = null;
		let newMediaLink: string | null = null;
		for (let i = 0; i < 24; i++) {
			await new Promise((r) => setTimeout(r, 5000));
			process.stdout.write(`  Poll ${i + 1}/24... `);

			const pollRes = await fetch(`${WHAPI_BASE_URL}/media?count=50`, {
				headers: { Authorization: `Bearer ${apiToken}` },
			});
			if (!pollRes.ok) {
				process.stdout.write("error\n");
				continue;
			}
			const pollData = (await pollRes.json()) as {
				files?: Array<{
					id: string;
					link?: string;
					mime_type?: string;
				}>;
			};

			const newFile = (pollData.files ?? []).find(
				(f) => !existingIds.has(f.id) && f.mime_type?.includes("ogg"),
			);

			if (newFile) {
				newMediaId = newFile.id;
				newMediaLink = newFile.link ?? null;
				process.stdout.write(`NEW MEDIA FOUND! ID: ${newMediaId}\n`);
				break;
			}
			process.stdout.write("no new media yet\n");
		}

		if (!newMediaId) {
			process.stdout.write(
				"\n  Timed out waiting for new media. Send a voice message and run the script again.\n",
			);
			return;
		}

		// Step 6: Test download of the new media
		log("STEP 6: Testing download of new media");

		// Test S3 link
		if (newMediaLink) {
			process.stdout.write(
				`  S3 link: ${newMediaLink.slice(0, 80)}...\n`,
			);
			const s3Res = await fetch(newMediaLink);
			const s3Buf = Buffer.from(await s3Res.arrayBuffer());
			process.stdout.write(
				`  S3 download: ${s3Buf.length > 0 ? `✅ ${s3Buf.length} bytes` : `❌ EMPTY (Content-Length: ${s3Res.headers.get("content-length")})`}\n`,
			);
			if (s3Buf.length > 0) {
				process.stdout.write(
					`  First hex: ${s3Buf.subarray(0, 16).toString("hex")}\n`,
				);
			}
		}

		// Test GET /media/{id}
		const apiRes = await fetch(`${WHAPI_BASE_URL}/media/${newMediaId}`, {
			headers: {
				Authorization: `Bearer ${apiToken}`,
				Accept: "application/octet-stream",
			},
		});
		const apiBuf = Buffer.from(await apiRes.arrayBuffer());
		process.stdout.write(
			`  GET /media: ${apiBuf.length > 0 ? `✅ ${apiBuf.length} bytes` : `❌ EMPTY (Content-Length: ${apiRes.headers.get("content-length")})`}\n`,
		);
		if (apiBuf.length > 0) {
			process.stdout.write(
				`  First hex: ${apiBuf.subarray(0, 16).toString("hex")}\n`,
			);
		}

		// Check the message metadata
		const msgsRes = await fetch(`${WHAPI_BASE_URL}/messages/list?count=5`, {
			headers: { Authorization: `Bearer ${apiToken}` },
		});
		const msgsData = (await msgsRes.json()) as {
			messages?: Array<Record<string, unknown>>;
		};
		const matchMsg = msgsData.messages?.find((m) => {
			const voice = m["voice"] as Record<string, unknown> | undefined;
			return voice?.["id"] === newMediaId;
		});
		if (matchMsg) {
			const voice = matchMsg["voice"] as Record<string, unknown>;
			const EMPTY_SHA = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=";
			const sha = voice?.["sha256"] as string;
			process.stdout.write(`  SHA-256: ${sha}\n`);
			process.stdout.write(
				`  SHA matches empty: ${sha === EMPTY_SHA ? "⚠️ YES (still broken)" : "✅ NO (file has real content)"}\n`,
			);
			process.stdout.write(`  Reported size: ${voice?.["file_size"]}\n`);
		}

		process.stdout.write(`\n${"=".repeat(60)}\n`);
		process.stdout.write("DEBUG COMPLETE\n");
	} finally {
		await db.$disconnect();
	}
}

main().catch((err) => {
	process.stderr.write(String(err));
	process.exit(1);
});
