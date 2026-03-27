import type net from "node:net";
import type { Connection, RowDataPacket } from "mysql2/promise";
import mysql from "mysql2/promise";
import { Client } from "ssh2";

interface IRadiusConfig {
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

function getConfig(): IRadiusConfig {
	const sshHost = process.env["IRADIUS_SSH_HOST"];
	const sshPort = process.env["IRADIUS_SSH_PORT"];
	const sshUser = process.env["IRADIUS_SSH_USER"];
	const sshPassword = process.env["IRADIUS_SSH_PASSWORD"];
	const dbUser = process.env["IRADIUS_DB_USER"];
	const dbPassword = process.env["IRADIUS_DB_PASSWORD"];
	const dbName = process.env["IRADIUS_DB_NAME"];

	if (
		!sshHost ||
		!sshUser ||
		!sshPassword ||
		!dbUser ||
		!dbPassword ||
		!dbName
	) {
		throw new Error(
			"Missing iRadius connection config. Required env vars: IRADIUS_SSH_HOST, IRADIUS_SSH_PORT, IRADIUS_SSH_USER, IRADIUS_SSH_PASSWORD, IRADIUS_DB_USER, IRADIUS_DB_PASSWORD, IRADIUS_DB_NAME",
		);
	}

	return {
		ssh: {
			host: sshHost,
			port: Number.parseInt(sshPort || "2222", 10),
			username: sshUser,
			password: sshPassword,
		},
		db: {
			user: dbUser,
			password: dbPassword,
			database: dbName,
		},
	};
}

/**
 * Creates an SSH tunnel to the iRadius server and opens a MySQL connection
 * through it. Returns a cleanup function to close everything.
 */
async function createTunnel(config: IRadiusConfig): Promise<{
	connection: Connection;
	close: () => Promise<void>;
}> {
	return new Promise((resolve, reject) => {
		const sshClient = new Client();

		sshClient.on("ready", () => {
			// Forward to MySQL on the remote server's localhost:3306
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
							// Handle null bytes and encoding issues
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
 * Execute a callback with an iRadius MySQL connection.
 * Handles SSH tunnel setup and cleanup automatically.
 */
export async function withIRadiusConnection<T>(
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

/** Row type returned by iRadius queries. */
export type IRadiusRow = Record<string, unknown>;

/**
 * Run a read-only query on the iRadius database.
 * Strips null bytes from string values.
 */
export async function queryIRadius(
	connection: Connection,
	sql: string,
): Promise<IRadiusRow[]> {
	const [rows] = await connection.query<RowDataPacket[]>(sql);

	// Strip null bytes from string values (iRadius has some corrupted data)
	for (const row of rows) {
		for (const key of Object.keys(row)) {
			const val = row[key];
			if (typeof val === "string") {
				row[key] = val.replace(/\0/g, "");
			}
		}
	}

	return rows as IRadiusRow[];
}

/**
 * Test the iRadius connection and return table counts.
 */
export async function testIRadiusConnection(): Promise<{
	connected: boolean;
	counts?: {
		subscribers: number;
		dealers: number;
		employees: number;
		accountTypes: number;
		stations: number;
		accessPoints: number;
		balances: number;
		invoices: number;
		dealerAccounts: number;
	};
	error?: string;
}> {
	try {
		return await withIRadiusConnection(async (conn) => {
			const [rows] = await conn.query<RowDataPacket[]>(
				`SELECT
					(SELECT COUNT(*) FROM User WHERE ProfileId = 4) as subscribers,
					(SELECT COUNT(*) FROM User WHERE ProfileId = 2) as dealers,
					(SELECT COUNT(*) FROM User WHERE ProfileId IN (1, 3, 6, 7, 8)) as employees,
					(SELECT COUNT(*) FROM AccountType) as accountTypes,
					(SELECT COUNT(*) FROM Station) as stations,
					(SELECT COUNT(*) FROM AccessPoint) as accessPoints,
					(SELECT COUNT(*) FROM UserBalance) as balances,
					(SELECT COUNT(*) FROM Invoice) as invoices,
					(SELECT COUNT(*) FROM DealerAccount) as dealerAccounts`,
			);
			const row = rows[0];

			return {
				connected: true,
				counts: {
					subscribers: (row?.["subscribers"] as number) ?? 0,
					dealers: (row?.["dealers"] as number) ?? 0,
					employees: (row?.["employees"] as number) ?? 0,
					accountTypes: (row?.["accountTypes"] as number) ?? 0,
					stations: (row?.["stations"] as number) ?? 0,
					accessPoints: (row?.["accessPoints"] as number) ?? 0,
					balances: (row?.["balances"] as number) ?? 0,
					invoices: (row?.["invoices"] as number) ?? 0,
					dealerAccounts: (row?.["dealerAccounts"] as number) ?? 0,
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

/**
 * Query live dashboard stats from iRadius MySQL (real-time data).
 * This opens an SSH tunnel for each call — use sparingly.
 */
/**
 * Fetch the list of currently online user IDs from iRadius.
 * Returns iRadius User.Id values (stored as Customer.externalId).
 */
export async function queryIRadiusOnlineUserIds(): Promise<string[] | null> {
	try {
		return await withIRadiusConnection(async (conn) => {
			const [rows] = await conn.query<RowDataPacket[]>(
				`SELECT User.Id FROM User
				LEFT JOIN UserNas ON User.Id = UserNas.UserId
				WHERE ProfileId = 4 AND IFNULL(Archived,0) = 0 AND Online = 1 AND Active = 1`,
			);
			return rows.map((r) => String(r["Id"]));
		});
	} catch (error) {
		// biome-ignore lint/suspicious/noConsole: database package cannot import @repo/logs
		console.error(
			"[iRadius Online Sync] Failed:",
			error instanceof Error ? error.message : error,
		);
		return null;
	}
}

export async function queryIRadiusLiveStats(): Promise<{
	online: number;
	offline: number;
	active: number;
	inactive: number;
	expired: number;
	fup: number;
	archived: number;
	totalSubscribers: number;
} | null> {
	try {
		return await withIRadiusConnection(async (conn) => {
			// Queries match iRadius DashboardDao.java exactly
			const [rows] = await conn.query<RowDataPacket[]>(
				`SELECT
					(SELECT COUNT(*) FROM User
						LEFT JOIN UserNas ON User.Id = UserNas.UserId
						WHERE ProfileId = 4 AND IFNULL(Archived,0) = 0 AND Online = 1 AND Active = 1) as onlineCount,
					(SELECT COUNT(*) FROM User
						LEFT JOIN UserNas ON User.Id = UserNas.UserId
						WHERE ProfileId = 4 AND IFNULL(Archived,0) = 0 AND IFNULL(Online,0) = 0 AND Active = 1) as offlineCount,
					(SELECT COUNT(*) FROM User
						LEFT JOIN UserNas ON User.Id = UserNas.UserId
						WHERE ProfileId = 4 AND IFNULL(Archived,0) = 0 AND Active = 1) as activeCount,
					(SELECT COUNT(*) FROM User
						LEFT JOIN UserNas ON User.Id = UserNas.UserId
						WHERE ProfileId = 4 AND IFNULL(Archived,0) = 0 AND IFNULL(Active,0) = 0) as inactiveCount,
					(SELECT COUNT(*) FROM User
						LEFT JOIN UserNas ON User.Id = UserNas.UserId
						WHERE ProfileId = 4 AND IFNULL(Archived,0) = 0 AND ExpiryAccount < NOW() AND Active = 1) as expiredCount,
					(SELECT COUNT(*) FROM User
						LEFT JOIN UserNas ON User.Id = UserNas.UserId
						WHERE ProfileId = 4 AND IFNULL(Archived,0) = 0 AND FupMode = 1 AND Active = 1) as fupCount,
					(SELECT COUNT(*) FROM User
						LEFT JOIN UserNas ON User.Id = UserNas.UserId
						WHERE ProfileId = 4 AND IFNULL(Archived,0) = 1) as archivedCount,
					(SELECT COUNT(*) FROM User
						LEFT JOIN UserNas ON User.Id = UserNas.UserId
						WHERE ProfileId = 4 AND IFNULL(Archived,0) = 0 AND Active = 1) as totalSubscribers`,
			);
			const row = rows[0];

			return {
				online: (row?.["onlineCount"] as number) ?? 0,
				offline: (row?.["offlineCount"] as number) ?? 0,
				active: (row?.["activeCount"] as number) ?? 0,
				inactive: (row?.["inactiveCount"] as number) ?? 0,
				expired: (row?.["expiredCount"] as number) ?? 0,
				fup: (row?.["fupCount"] as number) ?? 0,
				archived: (row?.["archivedCount"] as number) ?? 0,
				totalSubscribers: (row?.["totalSubscribers"] as number) ?? 0,
			};
		});
	} catch (error) {
		// biome-ignore lint/suspicious/noConsole: database package cannot import @repo/logs
		console.error(
			"[iRadius Live Stats] Failed:",
			error instanceof Error ? error.message : error,
		);
		return null;
	}
}
