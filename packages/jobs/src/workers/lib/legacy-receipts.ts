import { config } from "@repo/config";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { uploadBuffer } from "@repo/storage";

// Legacy expense/collection receipt photos live on the old billing server's
// web root under /worker_images/<image_name>. The billing-sync used to store
// that bare filename in Expense.receiptUrl, which the UI renders as
// `<img src="receipt.jpg">` → resolves against the app origin → 404 (broken).
//
// The fix mirrors the native receipt path: copy the bytes into R2 and store a
// `/image-proxy/<bucket>/<path>` URL the existing image-proxy route can serve.
// We store a RELATIVE proxy URL so it stays correct regardless of which domain
// (worker vs web, dev vs prod) renders it.

const LEGACY_RECEIPT_BASE_URL =
	process.env["BILLING_RECEIPTS_BASE_URL"]?.replace(/\/+$/, "") ??
	"https://billing.libancomlb.com/worker_images";

const RECEIPT_BUCKET = config.storage.bucketNames.avatars;

/** Deterministic R2 object key for a legacy receipt — stable across re-syncs. */
export function legacyReceiptStoragePath(
	imageName: string,
	organizationId: string,
): string {
	return `expenses/${organizationId}/legacy/${imageName}`;
}

/** Relative image-proxy URL for a legacy receipt (domain-agnostic). */
export function legacyReceiptProxyUrl(
	imageName: string,
	organizationId: string,
): string {
	const path = legacyReceiptStoragePath(imageName, organizationId);
	const encoded = path.split("/").map(encodeURIComponent).join("/");
	return `/image-proxy/${RECEIPT_BUCKET}/${encoded}`;
}

/**
 * If `rawReceipt` is a bare legacy filename, return its proxy URL; if it's
 * already a proxy URL (or empty) return it unchanged. Used by the billing-sync
 * so re-runs never clobber an already-migrated URL back to a bare name.
 */
export function normalizeReceiptUrl(
	rawReceipt: string | null | undefined,
	organizationId: string,
): string | null {
	const value = rawReceipt?.trim();
	if (!value) {
		return null;
	}
	if (value.startsWith("/image-proxy/") || value.startsWith("http")) {
		return value;
	}
	return legacyReceiptProxyUrl(value, organizationId);
}

/**
 * Fetch a legacy receipt from the billing server and upload it to R2 at its
 * deterministic path. Idempotent (re-upload is harmless). Returns true on
 * success. The bare image name is recoverable from a stored proxy URL via
 * `legacyReceiptImageName`.
 */
export async function migrateLegacyReceiptBytes(
	imageName: string,
	organizationId: string,
): Promise<boolean> {
	try {
		// Hard timeout — a hanging legacy-server fetch must not block a worker
		// slot forever (that stalled the whole backfill once).
		const res = await fetch(
			`${LEGACY_RECEIPT_BASE_URL}/${encodeURIComponent(imageName)}`,
			{ signal: AbortSignal.timeout(20_000) },
		);
		if (!res.ok) {
			return false;
		}
		const buffer = Buffer.from(await res.arrayBuffer());
		const contentType = res.headers.get("content-type") ?? "image/jpeg";
		await uploadBuffer(
			legacyReceiptStoragePath(imageName, organizationId),
			buffer,
			{ bucket: RECEIPT_BUCKET, contentType },
		);
		return true;
	} catch (error) {
		logger.warn("[Legacy Receipt] migrate failed", {
			imageName,
			error: error instanceof Error ? error.message : String(error),
		});
		return false;
	}
}

/** Recover the original legacy filename from a stored receipt value. */
export function legacyReceiptImageName(
	receipt: string | null | undefined,
): string | null {
	const value = receipt?.trim();
	if (!value) {
		return null;
	}
	// Stored proxy URL: .../legacy/<name> (url-encoded last segment).
	const proxyMatch = value.match(/\/legacy\/([^/?#]+)$/);
	if (proxyMatch?.[1]) {
		return decodeURIComponent(proxyMatch[1]);
	}
	// Bare filename (pre-migration), no path separators.
	if (!value.includes("/")) {
		return value;
	}
	return null;
}

export interface BackfillResult {
	scanned: number;
	migrated: number;
	rewritten: number;
	failed: number;
}

/**
 * One-off (idempotent) backfill: copy every legacy expense receipt into R2 and
 * rewrite its `Expense.receiptUrl` to the image-proxy URL. Safe to re-run — it
 * only touches rows whose receipt resolves to a legacy filename and skips ones
 * already pointing at an external/non-legacy URL.
 */
export async function backfillLegacyReceipts(options?: {
	organizationId?: string;
	concurrency?: number;
	onProgress?: (done: number, total: number) => void;
}): Promise<BackfillResult> {
	const concurrency = options?.concurrency ?? 4;
	const rows = await db.expense.findMany({
		where: {
			receiptUrl: { not: null },
			...(options?.organizationId
				? { organizationId: options.organizationId }
				: {}),
		},
		select: { id: true, organizationId: true, receiptUrl: true },
	});

	const result: BackfillResult = {
		scanned: rows.length,
		migrated: 0,
		rewritten: 0,
		failed: 0,
	};

	let index = 0;
	const worker = async () => {
		while (index < rows.length) {
			const row = rows[index++];
			if (!row) {
				continue;
			}
			const imageName = legacyReceiptImageName(row.receiptUrl);
			if (!imageName) {
				continue;
			}
			const ok = await migrateLegacyReceiptBytes(
				imageName,
				row.organizationId,
			);
			if (!ok) {
				result.failed++;
				continue;
			}
			result.migrated++;
			const proxyUrl = legacyReceiptProxyUrl(
				imageName,
				row.organizationId,
			);
			if (row.receiptUrl !== proxyUrl) {
				await db.expense.update({
					where: { id: row.id },
					data: { receiptUrl: proxyUrl },
				});
				result.rewritten++;
			}
			options?.onProgress?.(result.migrated + result.failed, rows.length);
		}
	};

	await Promise.all(
		Array.from({ length: Math.min(concurrency, rows.length) }, worker),
	);
	return result;
}
