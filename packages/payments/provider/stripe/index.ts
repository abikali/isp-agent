import {
	addPurchasedCredits,
	createPurchase,
	deletePurchaseBySubscriptionId,
	getPurchaseBySubscriptionId,
	updatePurchase,
} from "@repo/database";
import { logger } from "@repo/logs";
import Stripe from "stripe";
import { initializeCreditsForPurchase } from "../../src/lib/credits";
import { setCustomerIdToEntity } from "../../src/lib/customer";

import type {
	CancelSubscription,
	CreateCheckoutLink,
	CreateCustomerPortalLink,
	SetSubscriptionSeats,
	WebhookHandler,
} from "../../types";

let stripeClient: Stripe | null = null;

export function getStripeClient() {
	if (stripeClient) {
		return stripeClient;
	}

	const stripeSecretKey = process.env["STRIPE_SECRET_KEY"] as string;

	if (!stripeSecretKey) {
		throw new Error("Missing env variable STRIPE_SECRET_KEY");
	}

	stripeClient = new Stripe(stripeSecretKey);

	return stripeClient;
}

export const createCheckoutLink: CreateCheckoutLink = async (options) => {
	const stripeClient = getStripeClient();
	const {
		type,
		productId,
		redirectUrl,
		customerId,
		organizationId,
		userId,
		trialPeriodDays,
		seats,
		email,
		metadata: customMetadata,
	} = options;

	const metadata = {
		organization_id: organizationId || null,
		user_id: userId || null,
		...customMetadata,
	};

	const subscriptionData: {
		metadata: typeof metadata;
		trial_period_days?: number;
	} = {
		metadata,
	};
	if (trialPeriodDays !== undefined) {
		subscriptionData.trial_period_days = trialPeriodDays;
	}

	const sessionParams: Stripe.Checkout.SessionCreateParams = {
		mode: type === "subscription" ? "subscription" : "payment",
		success_url: redirectUrl ?? "",
		line_items: [
			{
				quantity: seats ?? 1,
				price: productId,
			},
		],
		metadata,
	};

	if (customerId) {
		sessionParams.customer = customerId;
	} else if (email) {
		sessionParams.customer_email = email;
	}

	if (type === "one-time") {
		sessionParams.payment_intent_data = { metadata };
		sessionParams.customer_creation = "always";
	} else {
		sessionParams.subscription_data = subscriptionData;
	}

	const response = await stripeClient.checkout.sessions.create(sessionParams);

	return response.url;
};

export const createCustomerPortalLink: CreateCustomerPortalLink = async ({
	customerId,
	redirectUrl,
}) => {
	const stripeClient = getStripeClient();

	const response = await stripeClient.billingPortal.sessions.create({
		customer: customerId,
		return_url: redirectUrl ?? "",
	});

	return response.url;
};

export const setSubscriptionSeats: SetSubscriptionSeats = async ({
	id,
	seats,
}) => {
	const stripeClient = getStripeClient();

	const subscription = await stripeClient.subscriptions.retrieve(id);

	if (!subscription) {
		throw new Error("Subscription not found.");
	}

	const subscriptionItemId = subscription.items.data[0]?.id;
	if (!subscriptionItemId) {
		throw new Error("Subscription item not found.");
	}

	await stripeClient.subscriptions.update(id, {
		items: [
			{
				id: subscriptionItemId,
				quantity: seats,
			},
		],
	});
};

export const cancelSubscription: CancelSubscription = async (id) => {
	const stripeClient = getStripeClient();

	await stripeClient.subscriptions.cancel(id);
};

export const webhookHandler: WebhookHandler = async (req) => {
	const stripeClient = getStripeClient();

	if (!req.body) {
		return new Response("Invalid request.", {
			status: 400,
		});
	}

	let event: Stripe.Event | undefined;

	try {
		event = await stripeClient.webhooks.constructEventAsync(
			await req.text(),
			req.headers.get("stripe-signature") as string,
			process.env["STRIPE_WEBHOOK_SECRET"] as string,
		);
	} catch (e) {
		logger.error(e);

		return new Response("Invalid request.", {
			status: 400,
		});
	}

	try {
		switch (event.type) {
			case "checkout.session.completed": {
				const { mode, metadata, customer, id } = event.data.object;

				if (mode === "subscription") {
					break;
				}

				const checkoutSession =
					await stripeClient.checkout.sessions.retrieve(id, {
						expand: ["line_items"],
					});

				const productId =
					checkoutSession.line_items?.data[0]?.price?.id;

				if (!productId) {
					return new Response("Missing product ID.", {
						status: 400,
					});
				}

				const purchase = await createPurchase({
					organizationId: metadata?.["organization_id"] || null,
					userId: metadata?.["user_id"] || null,
					customerId: customer as string,
					type: "ONE_TIME",
					productId,
				});

				const entityInfo1: {
					organizationId?: string;
					userId?: string;
				} = {};
				if (metadata?.["organization_id"]) {
					entityInfo1.organizationId = metadata["organization_id"];
				}
				if (metadata?.["user_id"]) {
					entityInfo1.userId = metadata["user_id"];
				}
				await setCustomerIdToEntity(customer as string, entityInfo1);

				// Handle AI credit package purchases
				if (
					purchase &&
					metadata?.["credit_package_id"] &&
					metadata?.["credits"] &&
					metadata?.["organization_id"]
				) {
					const credits = Number.parseInt(metadata["credits"], 10);
					if (!Number.isNaN(credits) && credits > 0) {
						await addPurchasedCredits(
							metadata["organization_id"],
							credits,
							purchase.id,
						);
					}
				}

				break;
			}
			case "customer.subscription.created": {
				const { metadata, customer, items, id } = event.data.object;

				const productId = items?.data[0]?.price?.id;

				if (!productId) {
					return new Response("Missing product ID.", {
						status: 400,
					});
				}

				// Idempotency: Check if subscription already exists
				const existingSubscription =
					await getPurchaseBySubscriptionId(id);
				if (existingSubscription) {
					logger.info(
						"Subscription already exists, skipping creation",
						{
							subscriptionId: id,
							purchaseId: existingSubscription.id,
						},
					);
					break;
				}

				const purchase = await createPurchase({
					subscriptionId: id,
					organizationId: metadata?.["organization_id"] || null,
					userId: metadata?.["user_id"] || null,
					customerId: customer as string,
					type: "SUBSCRIPTION",
					productId,
					status: event.data.object.status,
				});

				const entityInfo2: {
					organizationId?: string;
					userId?: string;
				} = {};
				if (metadata?.["organization_id"]) {
					entityInfo2.organizationId = metadata["organization_id"];
				}
				if (metadata?.["user_id"]) {
					entityInfo2.userId = metadata["user_id"];
				}
				await setCustomerIdToEntity(customer as string, entityInfo2);

				// Initialize AI credits based on the plan's monthly allocation
				// Wrapped in try-catch to prevent webhook failure if credit init fails
				// This ensures the subscription is created even if credits fail to initialize
				if (purchase?.organizationId) {
					try {
						await initializeCreditsForPurchase(
							purchase.organizationId,
							productId,
						);
					} catch (creditError) {
						// Log error for manual intervention but don't fail the webhook
						// The subscription is already created; credits can be initialized manually
						logger.error(
							"Failed to initialize credits for new subscription",
							{
								organizationId: purchase.organizationId,
								subscriptionId: id,
								productId,
								purchaseId: purchase.id,
								error:
									creditError instanceof Error
										? creditError.message
										: creditError,
							},
						);
					}
				}

				break;
			}
			case "customer.subscription.updated": {
				const subscriptionId = event.data.object.id;

				const existingPurchase =
					await getPurchaseBySubscriptionId(subscriptionId);

				if (existingPurchase) {
					const updateData: Parameters<typeof updatePurchase>[0] = {
						id: existingPurchase.id,
						status: event.data.object.status,
					};
					const newProductId =
						event.data.object.items?.data[0]?.price?.id;
					if (newProductId) {
						updateData.productId = newProductId;
					}
					const updatedPurchase = await updatePurchase(updateData);

					// Update AI credits if plan changed (handles upgrades/downgrades)
					// initializeCredits uses upsert, so safe to call on every update
					if (newProductId && updatedPurchase?.organizationId) {
						try {
							await initializeCreditsForPurchase(
								updatedPurchase.organizationId,
								newProductId,
							);
						} catch (creditError) {
							// Log error for manual intervention but don't fail the webhook
							logger.error(
								"Failed to update credits for plan change",
								{
									organizationId:
										updatedPurchase.organizationId,
									subscriptionId,
									newProductId,
									purchaseId: updatedPurchase.id,
									error:
										creditError instanceof Error
											? creditError.message
											: creditError,
								},
							);
						}
					}
				}

				break;
			}
			case "customer.subscription.deleted": {
				await deletePurchaseBySubscriptionId(event.data.object.id);

				break;
			}

			default:
				return new Response("Unhandled event type.", {
					status: 200,
				});
		}

		return new Response(null, { status: 204 });
	} catch (error) {
		logger.error("Stripe webhook error", {
			error: error instanceof Error ? error.message : error,
		});

		// Distinguish between permanent failures (400) and transient errors (500)
		// 400 = permanent failure, don't retry (e.g., missing data, invalid state)
		// 500 = transient error, please retry (e.g., database connection, external service)
		const isPermanentFailure =
			error instanceof Error &&
			(error.message.includes("Missing") ||
				error.message.includes("Invalid") ||
				error.message.includes("not found"));

		return new Response(
			`Webhook error: ${error instanceof Error ? error.message : ""}`,
			{
				status: isPermanentFailure ? 400 : 500,
			},
		);
	}
};
