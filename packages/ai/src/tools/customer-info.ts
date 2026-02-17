import { tool } from "ai";
import { z } from "zod";
import type { RegisteredTool, ToolContext } from "./types";

function createCustomerInfoTool(context: ToolContext) {
	return tool({
		description:
			"Get verified customer's account details (balance, plan, connection status, or overview). The customer must be verified with their PIN first using verify-customer-pin.",
		inputSchema: z.object({
			infoType: z
				.enum(["balance", "plan", "connection", "overview"])
				.describe(
					"Type of info: balance (billing), plan (subscription), connection (technical), or overview (summary)",
				),
		}),
		execute: async (args) => {
			try {
				const { db } = await import("@repo/database");

				// Gate check: verify customer is authenticated
				const conversation = await db.aiConversation.findUnique({
					where: { id: context.conversationId },
					select: { verifiedCustomerId: true },
				});

				if (!conversation?.verifiedCustomerId) {
					return {
						success: false,
						message:
							"Customer not verified. Please identify the customer and verify with PIN first.",
					};
				}

				const customerId = conversation.verifiedCustomerId;

				if (args.infoType === "balance") {
					const customer = await db.customer.findFirst({
						where: {
							id: customerId,
							organizationId: context.organizationId,
						},
						select: {
							balance: true,
							monthlyRate: true,
							billingDay: true,
						},
					});

					if (!customer) {
						return {
							success: false,
							message: "Customer not found.",
						};
					}

					return {
						success: true,
						data: {
							balance: customer.balance,
							monthlyRate: customer.monthlyRate,
							billingDay: customer.billingDay,
						},
					};
				}

				if (args.infoType === "plan") {
					const customer = await db.customer.findFirst({
						where: {
							id: customerId,
							organizationId: context.organizationId,
						},
						select: {
							plan: {
								select: {
									name: true,
									downloadSpeed: true,
									uploadSpeed: true,
									monthlyPrice: true,
								},
							},
						},
					});

					if (!customer) {
						return {
							success: false,
							message: "Customer not found.",
						};
					}

					if (!customer.plan) {
						return {
							success: true,
							data: { plan: null, message: "No plan assigned." },
						};
					}

					return {
						success: true,
						data: {
							planName: customer.plan.name,
							downloadSpeed: customer.plan.downloadSpeed,
							uploadSpeed: customer.plan.uploadSpeed,
							monthlyPrice: customer.plan.monthlyPrice,
						},
					};
				}

				if (args.infoType === "connection") {
					const customer = await db.customer.findFirst({
						where: {
							id: customerId,
							organizationId: context.organizationId,
						},
						select: {
							status: true,
							connectionType: true,
							ipAddress: true,
							station: {
								select: { name: true },
							},
						},
					});

					if (!customer) {
						return {
							success: false,
							message: "Customer not found.",
						};
					}

					return {
						success: true,
						data: {
							status: customer.status,
							connectionType: customer.connectionType,
							station: customer.station?.name ?? null,
							ipAddress: customer.ipAddress,
						},
					};
				}

				// overview
				const customer = await db.customer.findFirst({
					where: {
						id: customerId,
						organizationId: context.organizationId,
					},
					select: {
						fullName: true,
						accountNumber: true,
						status: true,
						balance: true,
						plan: {
							select: { name: true },
						},
					},
				});

				if (!customer) {
					return {
						success: false,
						message: "Customer not found.",
					};
				}

				return {
					success: true,
					data: {
						fullName: customer.fullName,
						accountNumber: customer.accountNumber,
						status: customer.status,
						planName: customer.plan?.name ?? "No plan",
						balance: customer.balance,
					},
				};
			} catch (error) {
				return {
					success: false,
					message: `Failed to retrieve info: ${error instanceof Error ? error.message : "Unknown error"}`,
				};
			}
		},
	});
}

export const customerInfo: RegisteredTool = {
	metadata: {
		id: "customer-info",
		name: "Customer Info",
		description:
			"Get verified customer's account details (balance, plan, connection, overview). Requires PIN verification first.",
		category: "customer",
		requiresConfig: false,
	},
	factory: createCustomerInfoTool,
};
