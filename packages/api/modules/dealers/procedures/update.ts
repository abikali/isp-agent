import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const updateDealer = protectedProcedure
	.route({
		method: "POST",
		path: "/dealers/update",
		tags: ["Dealers"],
		summary: "Update a dealer",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			name: z.string().min(1).max(100).optional(),
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
				.optional(),
			credit: z.number().optional(),
			commission: z.number().optional(),
			smsSenderId: z.string().max(50).optional(),
			notificationAmount: z.number().optional(),
			fupResetPrice: z.number().optional(),
			extraOneGbPrice: z.number().optional(),
			extraOneGbCommission: z.number().optional(),
			canShowRate: z.boolean().optional(),
			canShowSpeed: z.boolean().optional(),
			noCharge: z.boolean().optional(),
			canSendMail: z.boolean().optional(),
			canSendSms: z.boolean().optional(),
			canExportToExcel: z.boolean().optional(),
			canAddDealer: z.boolean().optional(),
			canDeleteUser: z.boolean().optional(),
			canChangeAccountType: z.boolean().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"dealers",
			"update",
		);

		const existing = await db.ispDealer.findFirst({
			where: { id: input.id, organizationId: input.organizationId },
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Dealer not found",
			});
		}

		const updateData: Record<string, unknown> = {};
		if (input.name !== undefined) {
			updateData["name"] = input.name;
		}
		if (input.username !== undefined) {
			updateData["username"] = input.username ?? null;
		}
		if (input.email !== undefined) {
			updateData["email"] = input.email ?? null;
		}
		if (input.phone !== undefined) {
			updateData["phone"] = input.phone ?? null;
		}
		if (input.companyName !== undefined) {
			updateData["companyName"] = input.companyName ?? null;
		}
		if (input.companyAddress !== undefined) {
			updateData["companyAddress"] = input.companyAddress ?? null;
		}
		if (input.companyPhone !== undefined) {
			updateData["companyPhone"] = input.companyPhone ?? null;
		}
		if (input.companyMobile !== undefined) {
			updateData["companyMobile"] = input.companyMobile ?? null;
		}
		if (input.companyVatNumber !== undefined) {
			updateData["companyVatNumber"] = input.companyVatNumber ?? null;
		}
		if (input.parentDealerId !== undefined) {
			updateData["parentDealerId"] = input.parentDealerId ?? null;
		}
		if (input.status !== undefined) {
			updateData["status"] = input.status;
		}
		if (input.credit !== undefined) {
			updateData["credit"] = input.credit;
		}
		if (input.commission !== undefined) {
			updateData["commission"] = input.commission;
		}
		if (input.smsSenderId !== undefined) {
			updateData["smsSenderId"] = input.smsSenderId ?? null;
		}
		if (input.notificationAmount !== undefined) {
			updateData["notificationAmount"] = input.notificationAmount ?? null;
		}
		if (input.fupResetPrice !== undefined) {
			updateData["fupResetPrice"] = input.fupResetPrice ?? null;
		}
		if (input.extraOneGbPrice !== undefined) {
			updateData["extraOneGbPrice"] = input.extraOneGbPrice ?? null;
		}
		if (input.extraOneGbCommission !== undefined) {
			updateData["extraOneGbCommission"] =
				input.extraOneGbCommission ?? null;
		}
		if (input.canShowRate !== undefined) {
			updateData["canShowRate"] = input.canShowRate;
		}
		if (input.canShowSpeed !== undefined) {
			updateData["canShowSpeed"] = input.canShowSpeed;
		}
		if (input.noCharge !== undefined) {
			updateData["noCharge"] = input.noCharge;
		}
		if (input.canSendMail !== undefined) {
			updateData["canSendMail"] = input.canSendMail;
		}
		if (input.canSendSms !== undefined) {
			updateData["canSendSms"] = input.canSendSms;
		}
		if (input.canExportToExcel !== undefined) {
			updateData["canExportToExcel"] = input.canExportToExcel;
		}
		if (input.canAddDealer !== undefined) {
			updateData["canAddDealer"] = input.canAddDealer;
		}
		if (input.canDeleteUser !== undefined) {
			updateData["canDeleteUser"] = input.canDeleteUser;
		}
		if (input.canChangeAccountType !== undefined) {
			updateData["canChangeAccountType"] = input.canChangeAccountType;
		}

		const dealer = await db.ispDealer.update({
			where: { id: input.id },
			data: updateData,
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
