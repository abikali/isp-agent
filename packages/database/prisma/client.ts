import { PrismaPg } from "@prisma/adapter-pg";
import { customerStatusObserver } from "./extensions/customer-status-observer";
import { PrismaClient } from "./generated/client";

const createPrismaClient = () => {
	if (!process.env["DATABASE_URL"]) {
		throw new Error("DATABASE_URL is not set");
	}

	const adapter = new PrismaPg({
		connectionString: process.env["DATABASE_URL"],
	});

	return new PrismaClient({ adapter });
};

declare global {
	var prismaRawInstance: undefined | ReturnType<typeof createPrismaClient>;
}

/**
 * Unextended Prisma client — bypasses the customer status observer.
 * Use ONLY for code paths that must not re-trigger iRadius sync
 * (e.g. the iRadius sync worker writing back values pulled from iRadius,
 *  or conflict resolution applying the remote value).
 */
const dbRaw: ReturnType<typeof createPrismaClient> =
	globalThis.prismaRawInstance ?? createPrismaClient();

/**
 * Default Prisma client with the customer status observer applied.
 * Every `customer.update` / `updateMany` on this client that transitions
 * status fires the registered handlers fire-and-forget.
 */
const db = dbRaw.$extends(customerStatusObserver);

if (process.env["NODE_ENV"] !== "production") {
	globalThis.prismaRawInstance = dbRaw;
}

export { db, dbRaw };
export {
	type CustomerStatusChange,
	type CustomerStatusChangeHandler,
	registerCustomerStatusChangeHandler,
} from "./extensions/customer-status-observer";
