import { createId } from "@paralleldrive/cuid2";
import { db } from "../client";
import type { Prisma } from "../generated/client";

export async function getPurchaseById(id: string) {
	return db.purchase.findUnique({
		where: { id },
	});
}

export async function getPurchasesByOrganizationId(organizationId: string) {
	return db.purchase.findMany({
		where: {
			organizationId,
		},
	});
}

export async function getPurchasesByUserId(userId: string) {
	return db.purchase.findMany({
		where: {
			userId,
		},
	});
}

export async function getPurchaseBySubscriptionId(subscriptionId: string) {
	return db.purchase.findFirst({
		where: {
			subscriptionId,
		},
	});
}

export async function createPurchase(purchase: {
	type: "SUBSCRIPTION" | "ONE_TIME";
	customerId: string;
	productId: string;
	organizationId?: string | null;
	userId?: string | null;
	subscriptionId?: string | null;
	status?: string | null;
}) {
	const data: Prisma.PurchaseUncheckedCreateInput = {
		id: createId(),
		type: purchase.type,
		customerId: purchase.customerId,
		productId: purchase.productId,
		organizationId: purchase.organizationId ?? null,
		userId: purchase.userId ?? null,
		subscriptionId: purchase.subscriptionId ?? null,
		status: purchase.status ?? null,
		updatedAt: new Date(),
	};

	const created = await db.purchase.create({ data });

	return getPurchaseById(created.id);
}

export async function updatePurchase(purchase: {
	id: string;
	type?: "SUBSCRIPTION" | "ONE_TIME";
	customerId?: string;
	productId?: string;
	organizationId?: string;
	userId?: string;
	subscriptionId?: string;
	status?: string;
}) {
	const { id, ...data } = purchase;
	const updated = await db.purchase.update({
		where: { id },
		data,
	});

	return getPurchaseById(updated.id);
}

export async function deletePurchaseBySubscriptionId(subscriptionId: string) {
	await db.purchase.delete({
		where: {
			subscriptionId,
		},
	});
}
