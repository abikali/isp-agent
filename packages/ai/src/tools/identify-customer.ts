import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { RegisteredTool, ToolContext } from "./types";

const identifyCustomerDef = toolDefinition({
	name: "identify-customer",
	description:
		"Look up a customer by account number, phone number, or email address. Returns limited public info only (first name, last 4 digits of account number, PIN status). Use this when a customer wants to identify themselves.",
	inputSchema: z.object({
		query: z
			.string()
			.describe("The account number, phone, or email to search for"),
		queryType: z
			.enum(["account_number", "phone", "email"])
			.describe("The type of identifier being provided"),
	}),
});

function createIdentifyCustomerTool(context: ToolContext) {
	return identifyCustomerDef.server(async (args) => {
		try {
			const { db } = await import("@repo/database");

			const where: Record<string, unknown> = {
				organizationId: context.organizationId,
			};

			if (args.queryType === "account_number") {
				where["accountNumber"] = args.query;
			} else if (args.queryType === "phone") {
				where["phone"] = args.query;
			} else {
				where["email"] = args.query;
			}

			const customer = await db.customer.findFirst({
				where,
				select: {
					id: true,
					fullName: true,
					accountNumber: true,
					pinHash: true,
				},
			});

			if (!customer) {
				return {
					found: false,
					message: "No customer found with the provided information.",
				};
			}

			const firstName = customer.fullName.split(" ")[0];
			const accountLast4 = customer.accountNumber.slice(-4);

			return {
				found: true,
				customerId: customer.id,
				name: firstName,
				accountNumberLast4: accountLast4,
				hasPin: customer.pinHash !== null,
			};
		} catch (error) {
			return {
				found: false,
				message: `Lookup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	});
}

export const identifyCustomer: RegisteredTool = {
	metadata: {
		id: "identify-customer",
		name: "Identify Customer",
		description:
			"Look up a customer by account number, phone, or email to begin the verification process",
		category: "customer",
		requiresConfig: false,
	},
	factory: createIdentifyCustomerTool,
};
