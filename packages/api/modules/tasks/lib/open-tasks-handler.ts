import { MIKROTIK_PEER_IFACE } from "@repo/ai/isp-search-customer";
import { db, type Prisma } from "@repo/database";
import {
	authenticateOrgRequest,
	jsonResponse as json,
} from "../../api-keys/lib/authenticate-org-request";
import { FIELD_TASK_OPEN_FILTER } from "./field-task-filter";

/**
 * Pre-flight for the Telegram bot's task wizard: does this customer already
 * have open field work, and does anyone else on the same box?
 *
 * GET /api/task-ingest/:organizationSlug/open-tasks?customer_username=
 * Header `x-api-key` with `write:tasks` (the ingest's own permission).
 *
 * "Same box" is the same building interface (OLT / ether / base — not a
 * per-user PPPoE interface) or the same wireless access point. The web's
 * create-task notice applies the same open-task filter.
 */

const SAME_BOX_LIMIT = 10;

const taskSelect = {
	id: true,
	title: true,
	category: true,
	status: true,
	createdAt: true,
	assignments: {
		select: { employee: { select: { username: true, name: true } } },
	},
} satisfies Prisma.TaskSelect;

type SelectedTask = Prisma.TaskGetPayload<{ select: typeof taskSelect }>;

function nameOf(customer: {
	firstName: string | null;
	lastName: string | null;
}): string | null {
	const name = [customer.firstName, customer.lastName]
		.map((part) => part?.trim())
		.filter(Boolean)
		.join(" ");
	return name || null;
}

function assigneesOf(task: SelectedTask): string[] {
	return task.assignments.map((a) => a.employee.username ?? a.employee.name);
}

export async function openTasksHandler(
	request: Request,
	organizationSlug: string,
): Promise<Response> {
	const auth = await authenticateOrgRequest(
		request,
		organizationSlug,
		"write:tasks",
	);
	if (!auth.ok) {
		return auth.response;
	}
	const { organizationId } = auth;

	const username = new URL(request.url).searchParams
		.get("customer_username")
		?.trim();
	if (!username) {
		return json(
			{ success: false, error: "customer_username is required" },
			400,
		);
	}

	const customer = await db.customer.findFirst({
		where: { organizationId, username, deletedAt: null },
		select: {
			id: true,
			username: true,
			firstName: true,
			lastName: true,
			mikrotikInterface: true,
			accessPointId: true,
		},
	});
	if (!customer) {
		return json(
			{ success: false, error: `Customer not found: ${username}` },
			404,
		);
	}

	const boxMatch: Prisma.CustomerWhereInput[] = [];
	if (
		customer.mikrotikInterface &&
		MIKROTIK_PEER_IFACE.test(customer.mikrotikInterface)
	) {
		boxMatch.push({ mikrotikInterface: customer.mikrotikInterface });
	}
	if (customer.accessPointId) {
		boxMatch.push({ accessPointId: customer.accessPointId });
	}

	const [openTasks, neighbours] = await Promise.all([
		db.task.findMany({
			where: {
				organizationId,
				customerId: customer.id,
				...FIELD_TASK_OPEN_FILTER,
			},
			select: taskSelect,
			orderBy: { createdAt: "desc" },
			take: 10,
		}),
		boxMatch.length === 0
			? Promise.resolve([])
			: db.customer.findMany({
					where: {
						organizationId,
						deletedAt: null,
						id: { not: customer.id },
						OR: boxMatch,
						tasks: { some: FIELD_TASK_OPEN_FILTER },
					},
					select: {
						username: true,
						firstName: true,
						lastName: true,
						tasks: {
							where: FIELD_TASK_OPEN_FILTER,
							select: taskSelect,
							orderBy: { createdAt: "desc" },
						},
					},
					take: SAME_BOX_LIMIT,
				}),
	]);

	return json(
		{
			success: true,
			customer: { username: customer.username, name: nameOf(customer) },
			openTasks: openTasks.map((task) => ({
				id: task.id,
				title: task.title,
				category: task.category,
				status: task.status,
				createdAt: task.createdAt.toISOString(),
				assignees: assigneesOf(task),
			})),
			sameBox: neighbours.map((n) => ({
				username: n.username,
				name: nameOf(n),
				tasks: n.tasks.map((task) => ({
					title: task.title,
					status: task.status,
					assignees: assigneesOf(task),
				})),
			})),
		},
		200,
		{ "Cache-Control": "no-store" },
	);
}
