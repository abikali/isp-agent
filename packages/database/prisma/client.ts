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
	var prismaInstance: undefined | ReturnType<typeof createPrismaClient>;
}

const db = globalThis.prismaInstance ?? createPrismaClient();

if (process.env["NODE_ENV"] !== "production") {
	globalThis.prismaInstance = db;
}

export { db };
