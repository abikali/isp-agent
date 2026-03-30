import { db } from "@repo/database";
import z from "zod";
import { adminProcedure } from "../../../orpc/procedures";

export const createDealer = adminProcedure
	.route({
		method: "POST",
		path: "/admin/dealers",
		tags: ["Dealers"],
		summary: "Create a new dealer (admin only)",
	})
	.input(
		z.object({
			organizationId: z.string().optional(),
			name: z.string().min(1).max(100),
			username: z.string().max(100).optional(),
			email: z.string().email().optional(),
			phone: z.string().max(50).optional(),
			companyName: z.string().max(200).optional(),
			companyAddress: z.string().max(500).optional(),
			companyPhone: z.string().max(50).optional(),
			companyMobile: z.string().max(50).optional(),
			companyVatNumber: z.string().max(50).optional(),
			parentDealerId: z.string().optional(),
			status: z
				.enum(["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING"])
				.default("ACTIVE"),
			credit: z.number().default(0),
			commission: z.number().default(0),
			smsSenderId: z.string().max(50).optional(),
			notificationAmount: z.number().optional(),
			fupResetPrice: z.number().optional(),
			extraOneGbPrice: z.number().optional(),
			extraOneGbCommission: z.number().optional(),
			canShowRate: z.boolean().default(false),
			canShowSpeed: z.boolean().default(false),
			noCharge: z.boolean().default(false),
			canSendMail: z.boolean().default(false),
			canSendSms: z.boolean().default(false),
			canExportToExcel: z.boolean().default(false),
			canAddDealer: z.boolean().default(false),
			canDeleteUser: z.boolean().default(false),
			canChangeAccountType: z.boolean().default(false),
		}),
	)
	.handler(async ({ input }) => {
		const dealer = await db.ispDealer.create({
			data: {
				organizationId: input.organizationId ?? null,
				name: input.name,
				username: input.username ?? null,
				email: input.email ?? null,
				phone: input.phone ?? null,
				companyName: input.companyName ?? null,
				companyAddress: input.companyAddress ?? null,
				companyPhone: input.companyPhone ?? null,
				companyMobile: input.companyMobile ?? null,
				companyVatNumber: input.companyVatNumber ?? null,
				parentDealerId: input.parentDealerId ?? null,
				status: input.status,
				credit: input.credit,
				commission: input.commission,
				smsSenderId: input.smsSenderId ?? null,
				notificationAmount: input.notificationAmount ?? null,
				fupResetPrice: input.fupResetPrice ?? null,
				extraOneGbPrice: input.extraOneGbPrice ?? null,
				extraOneGbCommission: input.extraOneGbCommission ?? null,
				canShowRate: input.canShowRate,
				canShowSpeed: input.canShowSpeed,
				noCharge: input.noCharge,
				canSendMail: input.canSendMail,
				canSendSms: input.canSendSms,
				canExportToExcel: input.canExportToExcel,
				canAddDealer: input.canAddDealer,
				canDeleteUser: input.canDeleteUser,
				canChangeAccountType: input.canChangeAccountType,
			},
			select: {
				id: true,
				name: true,
				username: true,
				email: true,
				phone: true,
				companyName: true,
				status: true,
				credit: true,
				commission: true,
				createdAt: true,
			},
		});

		return { dealer };
	});
