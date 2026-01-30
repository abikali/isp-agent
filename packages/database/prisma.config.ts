import "dotenv/config";
import { defineConfig } from "prisma/config";

const databaseUrl = process.env["DATABASE_URL"];

export default defineConfig({
	schema: "prisma/schema.prisma",
	// Only configure datasource if DATABASE_URL is provided.
	// This allows `prisma generate` to run without a database connection.
	...(databaseUrl && {
		datasource: {
			url: databaseUrl,
		},
	}),
});
