import type { RouterClient } from "@orpc/server";
import { adminRouter } from "../modules/admin/router";
import { aiAgentsRouter } from "../modules/ai-agents/router";
import { apiKeysRouter } from "../modules/api-keys/router";
import { auditRouter } from "../modules/audit/router";
import { authRouter } from "../modules/auth/router";
import { customersRouter } from "../modules/customers/router";
import { employeesRouter } from "../modules/employees/router";
import { featureFlagsRouter } from "../modules/feature-flags/router";
import { integrationsRouter } from "../modules/integrations/router";
import { newsletterRouter } from "../modules/newsletter/router";
import { notificationsRouter } from "../modules/notifications/router";
import { organizationsRouter } from "../modules/organizations/router";
import { paymentsRouter } from "../modules/payments/router";
import { securityRouter } from "../modules/security/router";
import { servicePlansRouter } from "../modules/service-plans/router";
import { sessionsRouter } from "../modules/sessions/router";
import { stationsRouter } from "../modules/stations/router";
import { tasksRouter } from "../modules/tasks/router";
import { usersRouter } from "../modules/users/router";
import { watchersRouter } from "../modules/watchers/router";
import { webhooksRouter } from "../modules/webhooks/router";
import { publicProcedure } from "./procedures";

export const router = publicProcedure.router({
	admin: adminRouter,
	aiAgents: aiAgentsRouter,
	auth: authRouter,
	customers: customersRouter,
	employees: employeesRouter,
	newsletter: newsletterRouter,
	integrations: integrationsRouter,
	organizations: organizationsRouter,
	users: usersRouter,
	payments: paymentsRouter,
	audit: auditRouter,
	apiKeys: apiKeysRouter,
	webhooks: webhooksRouter,
	featureFlags: featureFlagsRouter,
	notifications: notificationsRouter,
	sessions: sessionsRouter,
	security: securityRouter,
	servicePlans: servicePlansRouter,
	stations: stationsRouter,
	tasks: tasksRouter,
	watchers: watchersRouter,
});

export type ApiRouter = typeof router;
export type ApiRouterClient = RouterClient<ApiRouter>;
