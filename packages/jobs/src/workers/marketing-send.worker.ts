import { decryptToken } from "@repo/ai";
import { db } from "@repo/database";
import { createSaltiClient, SaltiApiError } from "@repo/integrations";
import { logger } from "@repo/logs";
import { Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import { getWorkerConcurrency } from "../lib/worker-concurrency";
import { MARKETING_SEND_QUEUE_NAME } from "../queues/marketing-send.queue";
import type { MarketingSendJobData, MarketingSendJobResult } from "../types";

const BATCH_SIZE = 50;
const THROTTLE_MS = Number.parseInt(
	process.env["MARKETING_SEND_THROTTLE_MS"] ?? "1500",
	10,
);
// How often to re-check the broadcast's cancellation state mid-batch. With
// THROTTLE_MS at 1.5s, every 5 sends ≈ 7.5s cancellation latency.
const CANCEL_CHECK_EVERY = 5;

interface VariableMapping {
	kind: "static" | "field";
	value?: string;
	field?: string;
}

interface StoredVariables {
	header?: VariableMapping[];
	body?: VariableMapping[];
	button?: VariableMapping[];
}

function renderMapping(
	m: VariableMapping,
	recipientVars: Record<string, string>,
): string {
	if (m.kind === "static") {
		return m.value ?? "";
	}
	if (m.field) {
		return recipientVars[m.field] ?? "";
	}
	return "";
}

function buildComponents(
	mapping: StoredVariables,
	recipientVars: Record<string, string>,
): Array<{
	type: "header" | "body" | "button";
	sub_type?: "url" | "quick_reply";
	index?: number;
	parameters: Array<{ type: "text"; text: string }>;
}> {
	const out: ReturnType<typeof buildComponents> = [];
	if (mapping.header && mapping.header.length > 0) {
		out.push({
			type: "header",
			parameters: mapping.header.map((m) => ({
				type: "text",
				text: renderMapping(m, recipientVars),
			})),
		});
	}
	if (mapping.body && mapping.body.length > 0) {
		out.push({
			type: "body",
			parameters: mapping.body.map((m) => ({
				type: "text",
				text: renderMapping(m, recipientVars),
			})),
		});
	}
	if (mapping.button) {
		mapping.button.forEach((m, index) => {
			out.push({
				type: "button",
				sub_type: "url",
				index,
				parameters: [
					{ type: "text", text: renderMapping(m, recipientVars) },
				],
			});
		});
	}
	return out;
}

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

export function createMarketingSendWorker(): Worker<
	MarketingSendJobData,
	MarketingSendJobResult
> {
	return new Worker<MarketingSendJobData, MarketingSendJobResult>(
		MARKETING_SEND_QUEUE_NAME,
		async (job) => {
			const { broadcastId } = job.data;

			const broadcast = await db.marketingBroadcast.findUnique({
				where: { id: broadcastId },
			});
			if (!broadcast) {
				logger.warn(`[Marketing] broadcast ${broadcastId} not found`);
				return { success: false, sentCount: 0, failedCount: 0 };
			}

			if (
				broadcast.status === "completed" ||
				broadcast.status === "cancelled" ||
				broadcast.status === "failed"
			) {
				logger.info(
					`[Marketing] broadcast ${broadcastId} already ${broadcast.status}; skipping`,
				);
				return {
					success: true,
					sentCount: broadcast.sentCount,
					failedCount: broadcast.failedCount,
				};
			}

			const integration = await db.saltiIntegration.findUnique({
				where: { organizationId: broadcast.organizationId },
			});
			let endpoint: string;
			let token: string;
			const envToken =
				process.env["SALTI_API_TOKEN"] ?? process.env["WPBOX_TOKEN"];
			if (integration) {
				endpoint = integration.apiEndpoint;
				token = decryptToken(integration.encryptedApiToken);
			} else if (envToken) {
				endpoint =
					process.env["SALTI_API_ENDPOINT"] ??
					"https://saltimarketing.com/";
				token = envToken;
			} else {
				await db.marketingBroadcast.update({
					where: { id: broadcast.id },
					data: {
						status: "failed",
						completedAt: new Date(),
					},
				});
				logger.warn(
					`[Marketing] broadcast ${broadcastId}: no Salti credentials (DB row or env)`,
				);
				return { success: false, sentCount: 0, failedCount: 0 };
			}

			const client = createSaltiClient({ endpoint, token });

			await db.marketingBroadcast.update({
				where: { id: broadcast.id },
				data: {
					status: "running",
					startedAt: broadcast.startedAt ?? new Date(),
				},
			});

			const mapping = (broadcast.variables ?? {}) as StoredVariables;

			let sentCount = broadcast.sentCount;
			let failedCount = broadcast.failedCount;
			let cancelled = false;
			let processedThisRun = 0;

			const checkCancelled = async () => {
				const fresh = await db.marketingBroadcast.findUnique({
					where: { id: broadcast.id },
					select: { status: true },
				});
				return !fresh || fresh.status === "cancelled";
			};

			outer: while (!cancelled) {
				if (await checkCancelled()) {
					cancelled = true;
					break;
				}

				const batch = await db.marketingBroadcastRecipient.findMany({
					where: {
						broadcastId: broadcast.id,
						status: "queued",
					},
					orderBy: { createdAt: "asc" },
					take: BATCH_SIZE,
				});

				if (batch.length === 0) {
					break;
				}

				for (const recipient of batch) {
					if (
						processedThisRun > 0 &&
						processedThisRun % CANCEL_CHECK_EVERY === 0 &&
						(await checkCancelled())
					) {
						cancelled = true;
						break outer;
					}
					processedThisRun += 1;
					try {
						const recipientVars =
							(recipient.variables as Record<string, string>) ??
							{};
						const components = buildComponents(
							mapping,
							recipientVars,
						);
						const result = await client.sendTemplateMessage({
							phone: recipient.phone,
							template_name: broadcast.templateName,
							template_language: broadcast.templateLang,
							components,
						});
						const isSuccess =
							typeof result.status === "string" &&
							result.status.toLowerCase() === "success";
						if (isSuccess) {
							sentCount += 1;
							await db.marketingBroadcastRecipient.update({
								where: { id: recipient.id },
								data: {
									status: "sent",
									saltiMessageId:
										result.message_id !== undefined
											? String(result.message_id)
											: null,
									waMessageId: result.message_wamid ?? null,
									sentAt: new Date(),
									errorMessage: null,
								},
							});
						} else {
							failedCount += 1;
							await db.marketingBroadcastRecipient.update({
								where: { id: recipient.id },
								data: {
									status: "failed",
									errorMessage:
										result.message?.slice(0, 1000) ??
										"Salti returned non-success status",
								},
							});
						}
					} catch (error) {
						failedCount += 1;
						const message =
							error instanceof SaltiApiError
								? `${error.status} ${error.message}`
								: error instanceof Error
									? error.message
									: "Unknown send error";
						await db.marketingBroadcastRecipient.update({
							where: { id: recipient.id },
							data: {
								status: "failed",
								errorMessage: message.slice(0, 1000),
							},
						});
					}

					if (THROTTLE_MS > 0) {
						await sleep(THROTTLE_MS);
					}

					if (
						(sentCount + failedCount) % 10 === 0 ||
						sentCount + failedCount === broadcast.totalRecipients
					) {
						await db.marketingBroadcast.update({
							where: { id: broadcast.id },
							data: { sentCount, failedCount },
						});
					}
				}
			}

			if (cancelled) {
				// Status already flipped to "cancelled" by the cancel procedure;
				// just flush the latest counters so the UI sees the final state.
				await db.marketingBroadcast.update({
					where: { id: broadcast.id },
					data: { sentCount, failedCount },
				});
				logger.info(
					`[Marketing] broadcast ${broadcastId} cancelled mid-run after ${sentCount + failedCount}/${broadcast.totalRecipients}`,
				);
				return { success: true, sentCount, failedCount };
			}

			await db.marketingBroadcast.update({
				where: { id: broadcast.id },
				data: {
					sentCount,
					failedCount,
					status:
						failedCount > 0 && sentCount === 0
							? "failed"
							: "completed",
					completedAt: new Date(),
				},
			});

			logger.info(
				`[Marketing] broadcast ${broadcastId} done: ${sentCount} sent, ${failedCount} failed`,
			);
			return { success: true, sentCount, failedCount };
		},
		{
			connection: getRedisConnection(),
			concurrency: getWorkerConcurrency(
				"MARKETING_SEND_WORKER_CONCURRENCY",
				1,
			),
		},
	);
}
