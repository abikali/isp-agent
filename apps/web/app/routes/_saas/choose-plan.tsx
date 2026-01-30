import { config } from "@repo/config";
import { createPurchasesHelper } from "@repo/payments/lib/helper";
import { PricingTable } from "@saas/payments/client";
import { getPurchases } from "@saas/payments/lib/server";
import { AuthWrapper } from "@saas/shared/client";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { attemptAsync } from "es-toolkit";

const getChoosePlanDataFn = createServerFn({ method: "GET" })
	.inputValidator((data: { userId: string; organizationId?: string }) => data)
	.handler(async ({ data }) => {
		const [error, purchases] = await attemptAsync(() =>
			getPurchases(data.organizationId),
		);

		if (error || !purchases) {
			throw new Error("Failed to fetch purchases");
		}

		const { activePlan } = createPurchasesHelper(purchases);

		return {
			userId: data.userId,
			organizationId: data.organizationId,
			hasActivePlan: !!activePlan,
		};
	});

export const Route = createFileRoute("/_saas/choose-plan")({
	beforeLoad: ({ context }) => {
		const { organizations } = context;

		let organizationId: string | undefined;
		if (config.organizations.enable && config.organizations.enableBilling) {
			const organization = organizations.at(0);

			if (!organization) {
				throw redirect({ to: "/new-organization" });
			}

			organizationId = organization.id;
		}

		return { organizationId };
	},
	loader: async ({ context }) => {
		const data = await getChoosePlanDataFn({
			data: {
				userId: context.session.user.id,
				organizationId: context.organizationId,
			},
		});

		if (data.hasActivePlan) {
			throw redirect({ to: "/app" });
		}

		return data;
	},
	head: () => ({
		meta: [{ title: `Choose Plan - ${config.appName}` }],
	}),
	component: ChoosePlanPage,
});

function ChoosePlanPage() {
	const { userId, organizationId } = Route.useLoaderData();

	return (
		<AuthWrapper contentClass="max-w-5xl">
			<div className="mb-4 text-center">
				<h1 className="text-center font-bold text-2xl lg:text-3xl">
					Choose Your Plan
				</h1>
				<p className="text-muted-foreground text-sm lg:text-base">
					Select the plan that best fits your needs.
				</p>
			</div>

			<div>
				<PricingTable
					{...(organizationId
						? {
								organizationId,
							}
						: {
								userId,
							})}
				/>
			</div>
		</AuthWrapper>
	);
}
