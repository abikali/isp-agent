import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";

const createPrismaClient = () => {
	if (!process.env["DATABASE_URL"]) {
		throw new Error("DATABASE_URL is not set");
	}

	const adapter = new PrismaPg({
		connectionString: process.env["DATABASE_URL"],
		// The dashboard fires ~12 RPC calls (each running several queries) in
		// parallel; the default pg pool of 10 saturates and queries queue
		// (~600ms of pool-wait — each query is only ~25ms in PG). PG allows 100
		// connections and uses only a handful, so raise the ceiling. Tunable via
		// DB_POOL_MAX if the node's memory ever needs it lowered.
		max: Number(process.env["DB_POOL_MAX"] ?? 20),
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
