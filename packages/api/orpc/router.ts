import type { RouterClient } from "@orpc/server";
import { accessPointsRouter } from "../modules/access-points/router";
import { adminRouter } from "../modules/admin/router";
import { aiAgentsRouter } from "../modules/ai-agents/router";
import { apiKeysRouter } from "../modules/api-keys/router";
import { auditRouter } from "../modules/audit/router";
import { authRouter } from "../modules/auth/router";
import { basesRouter } from "../modules/bases/router";
import { billingRouter } from "../modules/billing/router";
import { customersRouter } from "../modules/customers/router";
import { dashboardRouter } from "../modules/dashboard/router";
import { employeesRouter } from "../modules/employees/router";
import { expensesRouter } from "../modules/expenses/router";
import { featureFlagsRouter } from "../modules/feature-flags/router";
import { followupsRouter } from "../modules/followups/router";
import { installationsRouter } from "../modules/installations/router";
import { integrationsRouter } from "../modules/integrations/router";
import { iradiusRouter } from "../modules/iradius/router";
import { marketingRouter } from "../modules/marketing/router";
import { newsletterRouter } from "../modules/newsletter/router";
import { notificationsRouter } from "../modules/notifications/router";
import { organizationsRouter } from "../modules/organizations/router";
import { paymentsRouter } from "../modules/payments/router";
import { pushRouter } from "../modules/push/router";
import { savedViewsRouter } from "../modules/saved-views/router";
import { securityRouter } from "../modules/security/router";
import { servicePlansRouter } from "../modules/service-plans/router";
import { sessionsRouter } from "../modules/sessions/router";
import { sharedRouter } from "../modules/shared/router";
import { stationsRouter } from "../modules/stations/router";
import { stockRouter } from "../modules/stock/router";
import { tasksRouter } from "../modules/tasks/router";
import { userPrefsRouter } from "../modules/user-prefs/router";
import { usersRouter } from "../modules/users/router";
import { watchersRouter } from "../modules/watchers/router";
import { webhooksRouter } from "../modules/webhooks/router";
import { publicProcedure } from "./procedures";

export const router = publicProcedure.router({
	accessPoints: accessPointsRouter,
	admin: adminRouter,
	aiAgents: aiAgentsRouter,
	bases: basesRouter,
	billing: billingRouter,
	auth: authRouter,
	customers: customersRouter,
	dashboard: dashboardRouter,
	employees: employeesRouter,
	expenses: expensesRouter,
	newsletter: newsletterRouter,
	installations: installationsRouter,
	integrations: integrationsRouter,
	iradius: iradiusRouter,
	marketing: marketingRouter,
	organizations: organizationsRouter,
	users: usersRouter,
	payments: paymentsRouter,
	push: pushRouter,
	audit: auditRouter,
	apiKeys: apiKeysRouter,
	webhooks: webhooksRouter,
	featureFlags: featureFlagsRouter,
	followups: followupsRouter,
	notifications: notificationsRouter,
	sessions: sessionsRouter,
	security: securityRouter,
	servicePlans: servicePlansRouter,
	shared: sharedRouter,
	stations: stationsRouter,
	stock: stockRouter,
	tasks: tasksRouter,
	userPrefs: userPrefsRouter,
	savedViews: savedViewsRouter,
	watchers: watchersRouter,
});

export type ApiRouter = typeof router;
export type ApiRouterClient = RouterClient<ApiRouter>;
