import type net from "node:net";
import type { Connection, RowDataPacket } from "mysql2/promise";
import mysql from "mysql2/promise";
import { Client } from "ssh2";

interface BillingConfig {
	ssh: {
		host: string;
		port: number;
		username: string;
		password: string;
	};
	db: {
		user: string;
		password: string;
		database: string;
	};
}

function getConfig(): BillingConfig {
	const sshHost = process.env["BILLING_SSH_HOST"];
	const sshPort = process.env["BILLING_SSH_PORT"];
	const sshUser = process.env["BILLING_SSH_USER"];
	const sshPassword = process.env["BILLING_SSH_PASSWORD"];
	const dbName = process.env["BILLING_DB_NAME"];

	if (!sshHost || !sshUser || !sshPassword || !dbName) {
		throw new Error(
			"Missing billing connection config. Required env vars: BILLING_SSH_HOST, BILLING_SSH_PORT, BILLING_SSH_USER, BILLING_SSH_PASSWORD, BILLING_DB_NAME",
		);
	}

	return {
		ssh: {
			host: sshHost,
			port: Number.parseInt(sshPort || "22", 10),
			username: sshUser,
			password: sshPassword,
		},
		db: {
			user: "root",
			password: "",
			database: dbName,
		},
	};
}

async function createTunnel(config: BillingConfig): Promise<{
	connection: Connection;
	close: () => Promise<void>;
}> {
	return new Promise((resolve, reject) => {
		const sshClient = new Client();

		sshClient.on("ready", () => {
			sshClient.forwardOut(
				"127.0.0.1",
				0,
				"127.0.0.1",
				3306,
				async (err, stream) => {
					if (err) {
						sshClient.end();
						reject(new Error(`SSH tunnel failed: ${err.message}`));
						return;
					}

					try {
						const connection = await mysql.createConnection({
							user: config.db.user,
							password: config.db.password,
							database: config.db.database,
							stream: stream as unknown as net.Socket,
							charset: "utf8mb4",
						});

						resolve({
							connection,
							close: async () => {
								await connection.end().catch(() => {});
								sshClient.end();
							},
						});
					} catch (dbErr) {
						sshClient.end();
						reject(dbErr);
					}
				},
			);
		});

		sshClient.on("error", (err) => {
			reject(new Error(`SSH connection failed: ${err.message}`));
		});

		sshClient.connect({
			host: config.ssh.host,
			port: config.ssh.port,
			username: config.ssh.username,
			password: config.ssh.password,
			readyTimeout: 10000,
		});
	});
}

/**
 * Execute a callback with a billing system MySQL connection.
 * Handles SSH tunnel setup and cleanup automatically.
 */
export async function withBillingConnection<T>(
	fn: (connection: Connection) => Promise<T>,
): Promise<T> {
	const config = getConfig();
	const { connection, close } = await createTunnel(config);

	try {
		return await fn(connection);
	} finally {
		await close();
	}
}

/** Row type returned by billing queries. */
export type BillingRow = Record<string, unknown>;

/**
 * Run a read-only query on the billing database.
 */
export async function queryBilling(
	connection: Connection,
	sql: string,
): Promise<BillingRow[]> {
	const [rows] = await connection.query<RowDataPacket[]>(sql);
	return rows as BillingRow[];
}

/**
 * Test the billing system connection and return table counts.
 */
export async function testBillingConnection(): Promise<{
	connected: boolean;
	counts?: {
		customers: number;
		payments: number;
		collections: number;
		expenses: number;
		stockItems: number;
		workerStock: number;
		installations: number;
	};
	error?: string;
}> {
	try {
		return await withBillingConnection(async (conn) => {
			const [rows] = await conn.query<RowDataPacket[]>(
				`SELECT
					(SELECT COUNT(*) FROM john) as customers,
					(SELECT COUNT(*) FROM john_payment) as payments,
					(SELECT COUNT(*) FROM john_collection) as collections,
					(SELECT COUNT(*) FROM expenses) as expenses,
					(SELECT COUNT(*) FROM admin_stock) as stockItems,
					(SELECT COUNT(*) FROM worker_stock) as workerStock,
					(SELECT COUNT(*) FROM installations) as installations`,
			);
			const row = rows[0];

			return {
				connected: true,
				counts: {
					customers: (row?.["customers"] as number) ?? 0,
					payments: (row?.["payments"] as number) ?? 0,
					collections: (row?.["collections"] as number) ?? 0,
					expenses: (row?.["expenses"] as number) ?? 0,
					stockItems: (row?.["stockItems"] as number) ?? 0,
					workerStock: (row?.["workerStock"] as number) ?? 0,
					installations: (row?.["installations"] as number) ?? 0,
				},
			};
		});
	} catch (error) {
		return {
			connected: false,
			error:
				error instanceof Error
					? error.message
					: "Unknown connection error",
		};
	}
}
