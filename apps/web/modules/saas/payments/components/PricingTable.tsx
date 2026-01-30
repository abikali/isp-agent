"use client";
import { type Config, config } from "@repo/config";
import type { PlanId } from "@saas/payments";
import { useLocaleCurrency } from "@shared/hooks/locale-currency";
import { useRouter } from "@shared/hooks/router";
import { orpc } from "@shared/lib/orpc";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@ui/components/tabs";
import { cn } from "@ui/lib";
import {
	ArrowRightIcon,
	BadgePercentIcon,
	CheckIcon,
	PhoneIcon,
	StarIcon,
} from "lucide-react";
import { useState } from "react";
import { usePlanData } from "../hooks/plan-data";

// Simple currency formatter helper
function formatCurrency(amount: number, currency: string) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
	}).format(amount);
}

const plans = config.payments.plans as Config["payments"]["plans"];

export function PricingTable({
	className,
	userId,
	organizationId,
	activePlanId,
}: {
	className?: string | undefined;
	userId?: string | undefined;
	organizationId?: string | undefined;
	activePlanId?: string | undefined;
}) {
	const router = useRouter();
	const localeCurrency = useLocaleCurrency();
	const [loading, setLoading] = useState<PlanId | false>(false);
	const [interval, setInterval] = useState<"month" | "year">("month");

	const { planData } = usePlanData();

	const createCheckoutLinkMutation = useMutation(
		orpc.payments.createCheckoutLink.mutationOptions(),
	);

	const onSelectPlan = async (planId: PlanId, productId?: string) => {
		if (!(userId || organizationId)) {
			router.push("/signup");
			return;
		}

		const plan = plans[planId];
		if (!plan) {
			return;
		}
		const price = plan.prices?.find(
			(price) => price.productId === productId,
		);

		if (!price) {
			return;
		}

		setLoading(planId);

		try {
			const { checkoutLink } =
				await createCheckoutLinkMutation.mutateAsync({
					type:
						price.type === "one-time" ? "one-time" : "subscription",
					productId: price.productId,
					organizationId,
					redirectUrl: window.location.href,
				});

			window.location.href = checkoutLink;
		} catch (_error) {
			// Silently fail - checkout errors are handled by the payment provider
		} finally {
			setLoading(false);
		}
	};

	const filteredPlans = Object.entries(plans).filter(
		([planId]) =>
			planId !== activePlanId && (!activePlanId || planId !== "free"),
	);

	const hasSubscriptions = filteredPlans.some(([_, plan]) =>
		plan.prices?.some((price) => price.type === "recurring"),
	);

	return (
		<div className={cn("@container", className)}>
			{hasSubscriptions && (
				<div className="mb-6 flex @xl:justify-center">
					<Tabs
						value={interval}
						onValueChange={(value) =>
							setInterval(value as typeof interval)
						}
						data-test="price-table-interval-tabs"
					>
						<TabsList className="border-foreground/10">
							<TabsTrigger value="month">Monthly</TabsTrigger>
							<TabsTrigger value="year">Yearly</TabsTrigger>
						</TabsList>
					</Tabs>
				</div>
			)}
			<div
				className={cn("grid grid-cols-1 gap-4", {
					"@xl:grid-cols-2": filteredPlans.length >= 2,
					"@3xl:grid-cols-3": filteredPlans.length >= 3,
					"@4xl:grid-cols-4": filteredPlans.length >= 4,
				})}
			>
				{filteredPlans
					.filter(([planId]) => planId !== activePlanId)
					.map(([planId, plan]) => {
						const { isFree, isEnterprise, prices, recommended } =
							plan;
						const { title, description, features } =
							planData[planId as keyof typeof planData];

						let price = prices?.find(
							(price) =>
								!price.hidden &&
								(price.type === "one-time" ||
									price.interval === interval) &&
								price.currency === localeCurrency,
						);

						if (isFree) {
							price = {
								amount: 0,
								currency: localeCurrency,
								interval,
								productId: "",
								type: "recurring",
							};
						}

						if (!(price || isEnterprise)) {
							return null;
						}

						return (
							<div
								key={planId}
								className={cn("rounded-3xl border p-6", {
									"border-2 border-primary": recommended,
								})}
								data-test="price-table-plan"
							>
								<div className="flex h-full flex-col justify-between gap-4">
									<div>
										{recommended && (
											<div className="-mt-9 flex justify-center">
												<div className="mb-2 flex h-6 w-auto items-center gap-1.5 rounded-full bg-primary px-2 py-1 font-semibold text-primary-foreground text-xs">
													<StarIcon className="size-3" />
													Recommended
												</div>
											</div>
										)}
										<h3
											className={cn(
												"my-0 font-semibold text-2xl",
												{
													"font-bold text-primary":
														recommended,
												},
											)}
										>
											{title}
										</h3>
										{description && (
											<div className="prose mt-2 text-foreground/60 text-sm">
												{description}
											</div>
										)}

										{!!features?.length && (
											<ul className="mt-4 grid list-none gap-2 text-sm">
												{features.map(
													(feature, key) => (
														<li
															key={key}
															className="flex items-center justify-start"
														>
															<CheckIcon className="mr-2 size-4 text-primary" />
															<span>
																{feature}
															</span>
														</li>
													),
												)}
											</ul>
										)}

										{price &&
											"trialPeriodDays" in price &&
											price.trialPeriodDays && (
												<div className="mt-4 flex items-center justify-start font-medium text-primary text-sm opacity-80">
													<BadgePercentIcon className="mr-2 size-4" />
													{price.trialPeriodDays} day
													free trial
												</div>
											)}
									</div>

									<div>
										{price && (
											<strong
												className="block font-medium text-2xl lg:text-3xl"
												data-test="price-table-plan-price"
											>
												{formatCurrency(
													price.amount,
													price.currency,
												)}
												{"interval" in price && (
													<span className="font-normal text-xs opacity-60">
														{" / "}
														{interval === "month"
															? price.intervalCount &&
																price.intervalCount >
																	1
																? `${price.intervalCount} months`
																: "month"
															: price.intervalCount &&
																	price.intervalCount >
																		1
																? `${price.intervalCount} years`
																: "year"}
													</span>
												)}
												{organizationId &&
													"seatBased" in price &&
													price.seatBased && (
														<span className="font-normal text-xs opacity-60">
															{" / "}
															per seat
														</span>
													)}
											</strong>
										)}

										{isEnterprise ? (
											<Button
												className="mt-4 w-full"
												variant="secondary"
												asChild
											>
												<Link to="/contact">
													<PhoneIcon className="mr-2 size-4" />
													Contact Sales
												</Link>
											</Button>
										) : (
											<Button
												className="mt-4 w-full"
												variant={
													recommended
														? "primary"
														: "secondary"
												}
												onClick={() =>
													onSelectPlan(
														planId as PlanId,
														price?.productId,
													)
												}
												loading={loading === planId}
											>
												{userId || organizationId
													? "Choose Plan"
													: "Get Started"}
												<ArrowRightIcon className="ml-2 size-4" />
											</Button>
										)}
									</div>
								</div>
							</div>
						);
					})}
			</div>
		</div>
	);
}
