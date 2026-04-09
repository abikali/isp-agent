import { PrismaPg } from "@prisma/adapter-pg";
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

const db: ReturnType<typeof createPrismaClient> =
	globalThis.prismaRawInstance ?? createPrismaClient();

if (process.env["NODE_ENV"] !== "production") {
	globalThis.prismaRawInstance = db;
}

/**
 * `dbRaw` is retained as an alias for `db` so existing callers (e.g. the
 * iRadius sync worker and conflict-resolution procedures) continue to
 * compile. There is no longer any Prisma extension layered on top, so the
 * distinction is historical — all writes go through the same client.
 */
const dbRaw = db;

export { db, dbRaw };
