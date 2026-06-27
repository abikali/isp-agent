import { db } from "@repo/database";
import { sendWhatsAppMaintenanceVisit } from "@repo/jobs";
import { logger } from "@repo/logs";
import { hasPermission, verifyApiKey } from "../../api-keys/lib/verify";

/**
 * Task ingest handler for the Telegram ISP bot.
 *
 * Replaces the legacy billing `task_api.php`. The bot only knows iRadius
 * usernames (customer + worker), so this endpoint accepts the same flat
 * payload, resolves username -> Customer/Employee within the org, and creates
 * a Task in the new system.
 *
 * Auth: `x-api-key` header holding a `libancom_` API key scoped to the org in
 * the URL. The key needs a write permission (`*`, `write:*`, or `write:tasks`).
 *
 * Body (JSON or x-www-form-urlencoded):
 *   type               "maintenance" | "uninstall"
 *   message            free-text description of the task
 *   customer_username  iRadius username -> Customer.username
 *   wid                worker username  -> Employee.username
 *   whatsapp           "yes" | "no" (notify the customer of a maintenance visit)
 */

interface IngestPayload {
	type: string;
	message: string;
	customer_username: string;
	wid: string;
	whatsapp: string;
}

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

async function parseBody(request: Request): Promise<Partial<IngestPayload>> {
	const contentType = request.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		return (await request.json()) as Partial<IngestPayload>;
	}
	const form = await request.formData();
	const result: Partial<IngestPayload> = {};
	const keys: (keyof IngestPayload)[] = [
		"type",
		"message",
		"customer_username",
		"wid",
		"whatsapp",
	];
	for (const key of keys) {
		const value = form.get(key);
		if (typeof value === "string") {
			result[key] = value;
		}
	}
	return result;
}

export async function taskIngestHandler(
	request: Request,
	organizationSlug: string,
): Promise<Response> {
	// 1. Authenticate via API key
	const plainKey = request.headers.get("x-api-key") ?? "";
	const verification = await verifyApiKey(plainKey);
	if (!verification.valid || !verification.apiKey) {
		logger.info("[Task Ingest] auth failed", {
			organizationSlug,
			error: verification.error,
		});
		return json({ success: false, error: "Unauthorized" }, 401);
	}
	const apiKey = verification.apiKey;

	if (!hasPermission(apiKey.permissions, "write:tasks")) {
		return json({ success: false, error: "Insufficient permissions" }, 403);
	}

	// 2. Resolve organization and ensure the key belongs to it
	const organization = await db.organization.findUnique({
		where: { slug: organizationSlug },
		select: { id: true },
	});
	if (!organization || organization.id !== apiKey.organizationId) {
		return json(
			{
				success: false,
				error: "API key not valid for this organization",
			},
			403,
		);
	}
	const organizationId = organization.id;

	// 3. Validate payload
	const body = await parseBody(request).catch(
		() => ({}) as Partial<IngestPayload>,
	);
	const type = body.type?.trim().toLowerCase();
	const message = body.message?.trim();
	const customerUsername = body.customer_username?.trim();
	const wid = body.wid?.trim();
	const sendWhatsApp = body.whatsapp?.trim().toLowerCase() === "yes";

	if (type !== "maintenance" && type !== "uninstall") {
		return json({ success: false, error: "Invalid task type" }, 400);
	}
	if (!message) {
		return json({ success: false, error: "Message is required" }, 400);
	}
	if (!customerUsername) {
		return json(
			{ success: false, error: "customer_username is required" },
			400,
		);
	}
	if (!wid) {
		return json({ success: false, error: "wid (worker) is required" }, 400);
	}

	// 4. Resolve customer + worker by username within the org
	const [customer, worker] = await Promise.all([
		db.customer.findFirst({
			where: { organizationId, username: customerUsername },
			select: { id: true, firstName: true, mobile: true },
		}),
		db.employee.findFirst({
			where: { organizationId, username: wid, deletedAt: null },
			select: { id: true, name: true, phone: true },
		}),
	]);

	if (!customer) {
		return json(
			{
				success: false,
				error: `Customer not found: ${customerUsername}`,
			},
			404,
		);
	}
	if (!worker) {
		return json({ success: false, error: `Worker not found: ${wid}` }, 404);
	}

	// 5. Create the task
	const category = type === "uninstall" ? "UNINSTALL" : "MAINTENANCE";
	const title =
		type === "uninstall"
			? `Uninstall: ${customerUsername}`
			: `Maintenance: ${customerUsername}`;

	const task = await db.task.create({
		data: {
			organizationId,
			title,
			description: message,
			priority: "MEDIUM",
			status: "OPEN",
			category,
			createdById: apiKey.createdById,
			customerId: customer.id,
			assignments: {
				create: [{ employeeId: worker.id }],
			},
		},
		select: { id: true },
	});

	logger.info("[Task Ingest] task created", {
		organizationSlug,
		taskId: task.id,
		type,
		customer: customerUsername,
		worker: wid,
		whatsapp: sendWhatsApp,
	});

	// 6. Fire-and-forget: tell the customer a maintenance visit is coming
	if (sendWhatsApp && customer.mobile) {
		sendWhatsAppMaintenanceVisit({
			phone: customer.mobile,
			customerName: customer.firstName,
			workerName: worker.name,
			workerPhone: worker.phone,
		}).catch((err: unknown) =>
			logger.warn("[Task Ingest] customer WhatsApp failed", {
				error: String(err),
			}),
		);
	}

	return json({ success: true, taskId: task.id });
}
