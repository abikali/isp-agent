import { getSaltiInboundQueue } from "../queues/salti-inbound.queue";

/** Queue one forwarded Salti webhook body for processing. */
export async function queueSaltiInbound(body: unknown): Promise<string> {
	const job = await getSaltiInboundQueue().add("inbound", {
		body,
		receivedAt: new Date().toISOString(),
	});
	return job.id ?? "";
}
