import type net from "node:net";
import type { Connection, RowDataPacket } from "mysql2/promise";
import mysql from "mysql2/promise";
import { Client } from "ssh2";

export type IRadiusConnection = Connection;

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

async function connectSsh(config: IRadiusConfig): Promise<Client> {
	const sshClient = new Client();
	await new Promise<void>((resolve, reject) => {
		sshClient.on("ready", () => {
			resolve();
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
	return sshClient;
}

async function openMysqlOverSsh(
	sshClient: Client,
	config: IRadiusConfig,
): Promise<Connection> {
	return new Promise((resolve, reject) => {
		sshClient.forwardOut(
			"127.0.0.1",
			0,
			"127.0.0.1",
			3306,
			async (err, stream) => {
				if (err) {
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
						// iRadius stores naive Beirut-local datetimes. Opt out of
						// the driver's UTC interpretation; safeDate() parses the
						// raw string under the worker's TZ=Asia/Beirut.
						dateStrings: true,
					});
					resolve(connection);
				} catch (dbErr) {
					reject(dbErr);
				}
			},
		);
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
	const sshClient = await connectSsh(config);
	let connection: Connection | null = null;
	try {
		connection = await openMysqlOverSsh(sshClient, config);
		return await fn(connection);
	} finally {
		await connection?.end().catch(() => {});
		sshClient.end();
	}
}

/**
 * Execute a callback with N parallel iRadius MySQL connections sharing one
 * SSH client. Each connection is an independent mysql2 `Connection` (separate
 * SSH-forwarded stream), so queries on different connections run concurrently
 * on the iRadius server.
 *
 * Use this for bulk writes where round-trip latency dominates: a single
 * connection serialises queries, so fan-out is the only way to amortise the
 * SSH + MySQL round-trip cost.
 */
export async function withIRadiusConnectionPool<T>(
	size: number,
	fn: (connections: Connection[]) => Promise<T>,
): Promise<T> {
	const config = getConfig();
	const sshClient = await connectSsh(config);
	let connections: Connection[] = [];
	try {
		connections = await Promise.all(
			Array.from({ length: size }, () =>
				openMysqlOverSsh(sshClient, config),
			),
		);
		return await fn(connections);
	} finally {
		await Promise.allSettled(connections.map((c) => c.end()));
		sshClient.end();
	}
}

/** Row type returned by iRadius queries. */
export type IRadiusRow = Record<string, unknown>;

/**
 * Run a read-only query on the iRadius database.
 * Strips null bytes from string values. Pass `params` to use `?` placeholders
 * for any user input rather than interpolating strings.
 */
export async function queryIRadius(
	connection: Connection,
	sql: string,
	params?: Array<string | number | null>,
): Promise<IRadiusRow[]> {
	const [rows] = params
		? await connection.query<RowDataPacket[]>(sql, params)
		: await connection.query<RowDataPacket[]>(sql);

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
 * Execute a parameterised mutation on the iRadius database.
 *
 * IMPORTANT: write access to the legacy iRadius MySQL is restricted to a
 * specific set of admin-action columns that the legacy GWT UI itself
 * mutates via plain single-row updates. See `docs/iradius-actions-
 * investigation.md` for the full audit of permitted writes. Do NOT use this
 * helper for arbitrary writes; it is intended only for the wrapper functions
 * in `@repo/api/customers/lib/iradius-api.ts`.
 *
 * Uses parameter binding (NOT string concatenation) to prevent injection.
 * Returns affectedRows so callers can verify the update landed on exactly
 * one row.
 */
export async function executeIRadius(
	connection: Connection,
	sql: string,
	params: Array<string | number | null>,
): Promise<{ affectedRows: number }> {
	const [result] = await connection.execute(sql, params);
	const affectedRows =
		(result as { affectedRows?: number }).affectedRows ?? 0;
	return { affectedRows };
}

/**
 * Run a shell command on the iRadius server over SSH, optionally piping
 * `stdin` into it. Returns the combined stdout/stderr text plus the exit
 * code (signal-terminated processes report code `null` from ssh2; that is
 * surfaced as `-1`).
 *
 * The shell command runs as the SSH user (root on iRadius). Callers must
 * treat any user-provided values as shell-untrusted and shell-quote them
 * — there is no built-in argv mode for ssh2's `exec`.
 *
 * This is the carve-out used by `iradiusForceDisconnect` to invoke the
 * MikroTik RouterOS API directly from the iRadius host (which is the only
 * machine with network reach to the NAS routers' private IPs).
 */
export async function execIRadiusShell(
	command: string,
	options?: { stdin?: string; timeoutMs?: number },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const config = getConfig();
	const sshClient = await connectSsh(config);
	try {
		return await new Promise<{
			stdout: string;
			stderr: string;
			exitCode: number;
		}>((resolve, reject) => {
			let timer: NodeJS.Timeout | null = null;
			sshClient.exec(command, (err, stream) => {
				if (err) {
					reject(err);
					return;
				}
				let stdout = "";
				let stderr = "";
				let exitCode = -1;
				stream.on("data", (chunk: Buffer) => {
					stdout += chunk.toString("utf8");
				});
				stream.stderr.on("data", (chunk: Buffer) => {
					stderr += chunk.toString("utf8");
				});
				stream.on("close", (code: number | null) => {
					if (timer) {
						clearTimeout(timer);
					}
					exitCode = typeof code === "number" ? code : -1;
					resolve({ stdout, stderr, exitCode });
				});
				if (options?.stdin !== undefined) {
					stream.stdin.end(options.stdin);
				} else {
					stream.stdin.end();
				}
				if (options?.timeoutMs && options.timeoutMs > 0) {
					timer = setTimeout(() => {
						stream.signal?.("KILL");
						stream.destroy();
						reject(
							new Error(
								`SSH exec timed out after ${options.timeoutMs}ms`,
							),
						);
					}, options.timeoutMs);
				}
			});
		});
	} finally {
		sshClient.end();
	}
}

/**
 * Test the iRadius connection and return table counts.
 */
export async function testIRadiusConnection(): Promise<{
	connected: boolean;
	counts?: {
		subscribers: number;
		employees: number;
		accountTypes: number;
		stations: number;
		accessPoints: number;
		balances: number;
		invoices: number;
	};
	error?: string;
}> {
	try {
		return await withIRadiusConnection(async (conn) => {
			const [rows] = await conn.query<RowDataPacket[]>(
				`SELECT
					(SELECT COUNT(*) FROM User WHERE ProfileId = 4) as subscribers,
					(SELECT COUNT(*) FROM User WHERE ProfileId IN (1, 3, 6, 7, 8)) as employees,
					(SELECT COUNT(*) FROM AccountType) as accountTypes,
					(SELECT COUNT(*) FROM Station) as stations,
					(SELECT COUNT(*) FROM AccessPoint) as accessPoints,
					(SELECT COUNT(*) FROM UserBalance) as balances,
					(SELECT COUNT(*) FROM Invoice) as invoices`,
			);
			const row = rows[0];

			return {
				connected: true,
				counts: {
					subscribers: (row?.["subscribers"] as number) ?? 0,
					employees: (row?.["employees"] as number) ?? 0,
					accountTypes: (row?.["accountTypes"] as number) ?? 0,
					stations: (row?.["stations"] as number) ?? 0,
					accessPoints: (row?.["accessPoints"] as number) ?? 0,
					balances: (row?.["balances"] as number) ?? 0,
					invoices: (row?.["invoices"] as number) ?? 0,
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

/** Monitor-field snapshot for a single iRadius Station. */
export interface IRadiusStationMonitor {
	externalId: string;
	online: boolean;
	uptime: string | null;
	boardName: string | null;
	cpuLoad: string | null;
	voltage: string | null;
	version: string | null;
	scanStatus: boolean;
}

/** Monitor-field snapshot for a single iRadius AccessPoint. */
export interface IRadiusAccessPointMonitor {
	externalId: string;
	online: boolean;
	uptime: string | null;
	signal: string | null;
	boardName: string | null;
	version: string | null;
	scanStatus: boolean;
	autoNegotiation: boolean;
	fullDuplex: boolean;
}

export function toBooleanFromBit(val: unknown): boolean {
	if (Buffer.isBuffer(val)) {
		return val[0] === 1;
	}
	return Boolean(val);
}

/**
 * Fetch live monitor fields for all Stations and AccessPoints from iRadius.
 * Returns null on connection failure so the caller can skip gracefully.
 *
 * Used by the 15s background monitor sync — this intentionally selects only
 * the fields that change during normal device operation, so the query stays
 * cheap even at high cadence.
 */
export async function queryIRadiusNetworkMonitor(): Promise<{
	stations: IRadiusStationMonitor[];
	accessPoints: IRadiusAccessPointMonitor[];
} | null> {
	try {
		return await withIRadiusConnection(async (conn) => {
			const [stationRows] = await conn.query<RowDataPacket[]>(
				`SELECT Id, Online, UpTime, BoardName, CpuLoad, Voltage, Version, ScanStatus
				FROM Station`,
			);
			const [apRows] = await conn.query<RowDataPacket[]>(
				`SELECT Id, Online, UpTime, \`Signal\`, BoardName, Version, ScanStatus, AutoNegotioation, FullDuplex
				FROM AccessPoint`,
			);

			const cleanString = (v: unknown): string | null => {
				if (typeof v !== "string") {
					return null;
				}
				const stripped = v.replace(/\0/g, "").trim();
				return stripped || null;
			};

			return {
				stations: stationRows.map((r) => ({
					externalId: String(r["Id"]),
					online: toBooleanFromBit(r["Online"]),
					uptime: cleanString(r["UpTime"]),
					boardName: cleanString(r["BoardName"]),
					cpuLoad: cleanString(r["CpuLoad"]),
					voltage: cleanString(r["Voltage"]),
					version: cleanString(r["Version"]),
					scanStatus: toBooleanFromBit(r["ScanStatus"]),
				})),
				accessPoints: apRows.map((r) => ({
					externalId: String(r["Id"]),
					online: toBooleanFromBit(r["Online"]),
					uptime: cleanString(r["UpTime"]),
					signal: cleanString(r["Signal"]),
					boardName: cleanString(r["BoardName"]),
					version: cleanString(r["Version"]),
					scanStatus: toBooleanFromBit(r["ScanStatus"]),
					autoNegotiation: toBooleanFromBit(r["AutoNegotioation"]),
					fullDuplex: toBooleanFromBit(r["FullDuplex"]),
				})),
			};
		});
	} catch (error) {
		// biome-ignore lint/suspicious/noConsole: database package cannot import @repo/logs
		console.error(
			"[iRadius Network Monitor] Failed:",
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
