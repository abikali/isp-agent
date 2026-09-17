import { db, getPrimaryPhone } from "@repo/database";
import { sendWhatsAppMaintenanceVisit } from "@repo/jobs";
import { logger } from "@repo/logs";
import {
	authenticateOrgRequest,
	jsonResponse as json,
} from "../../api-keys/lib/authenticate-org-request";
import { notifyTaskWorkers } from "./notify-task-workers";
import { bustTaskStats } from "./stats-cache";

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
	// 1. Authenticate via API key scoped to this organization
	const auth = await authenticateOrgRequest(
		request,
		organizationSlug,
		"write:tasks",
	);
	if (!auth.ok) {
		return auth.response;
	}
	const { apiKey, organizationId } = auth;

	// 2. Validate payload
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

	// 3. Resolve customer + worker by username within the org
	const [customer, worker] = await Promise.all([
		db.customer.findFirst({
			where: { organizationId, username: customerUsername },
			select: { id: true, firstName: true, mobile: true, phones: true },
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

	// 4. Create the task
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

	bustTaskStats(organizationId);

	logger.info("[Task Ingest] task created", {
		organizationSlug,
		taskId: task.id,
		type,
		customer: customerUsername,
		worker: wid,
		whatsapp: sendWhatsApp,
	});

	// Fire-and-forget: notify the assigned worker of the new field task.
	notifyTaskWorkers({
		organizationId,
		taskId: task.id,
		taskTitle: title,
		employeeIds: [worker.id],
		event: "assigned",
	});

	// 5. Fire-and-forget: tell the customer a maintenance visit is coming
	const customerPhone = getPrimaryPhone(customer.phones) ?? customer.mobile;
	if (sendWhatsApp && customerPhone) {
		sendWhatsAppMaintenanceVisit({
			phone: customerPhone,
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
