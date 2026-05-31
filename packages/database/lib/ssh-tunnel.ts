import net from "node:net";
import mysql, {
	type Connection,
	type Pool,
	type PoolConnection,
} from "mysql2/promise";
import { Client } from "ssh2";

/**
 * Persistent SSH-tunnelled MySQL pool.
 *
 * The legacy iRadius and billing MySQL servers are only reachable by tunnelling
 * over SSH. Opening a brand-new SSH client + MySQL connection on every query
 * (the previous design) cost ~1.7-1.9s per call — almost entirely the SSH
 * key-exchange + password auth + MySQL handshake over a ~60ms-RTT link — so
 * every page load and every action that touched these systems stalled for
 * ~2 seconds, even though the queries themselves run in ~200-250ms.
 *
 * This keeps ONE SSH client warm and runs a real mysql2 connection pool over it
 * via a tiny localhost forwarder: mysql2 connects to 127.0.0.1:<ephemeral>, and
 * each such socket is piped through `ssh.forwardOut` to the remote MySQL. The
 * SSH handshake is paid once (lazily, on first use); every subsequent query
 * reuses a pooled connection over the warm tunnel (~200-250ms). The pool gives
 * us correct per-lease isolation (so a callback that runs several queries keeps
 * its own connection for its duration), concurrency, and idle reaping for free.
 *
 * If the SSH client drops (network blip, remote restart, idle eviction) the
 * whole tunnel is torn down and rebuilt lazily on the next call; transient
 * connection errors are retried once against a freshly-rebuilt tunnel.
 */
export interface SshTunnelConfig {
	ssh: () => {
		host: string;
		port: number;
		username: string;
		password: string;
	};
	db: () => { user: string; password: string; database: string };
	/** Max concurrent MySQL connections over the tunnel. */
	connectionLimit?: number;
}

interface BuiltTunnel {
	ssh: Client;
	server: net.Server;
	pool: Pool;
	teardown: () => void;
}

function isTransientConnError(err: unknown): boolean {
	const code = (err as { code?: string })?.code ?? "";
	const msg = (err as { message?: string })?.message ?? "";
	return (
		/^(PROTOCOL_CONNECTION_LOST|PROTOCOL_SEQUENCE_TIMEOUT|POOL_CLOSED|POOL_ENDED|ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|ENOTFOUND|ERR_STREAM_PREMATURE_CLOSE)$/.test(
			code,
		) ||
		/connection is in closed state|Pool is closed|read ECONNRESET|This socket has been ended|Can't add new command|server closed the connection|fatal error|Connection lost|SSH (connection|tunnel) failed|connect ETIMEDOUT|Handshake inactivity timeout/i.test(
			msg,
		)
	);
}

export interface SshTunnel {
	/** Lease one connection for the duration of `fn`, then release it. */
	withConnection: <T>(
		fn: (connection: Connection) => Promise<T>,
	) => Promise<T>;
	/**
	 * Lease `size` independent connections (for fan-out parallel queries) for
	 * the duration of `fn`, then release them all.
	 */
	withConnections: <T>(
		size: number,
		fn: (connections: Connection[]) => Promise<T>,
	) => Promise<T>;
	/** The warm SSH client itself (for `exec`, not DB queries). */
	getSshClient: () => Promise<Client>;
	/** Force teardown + rebuild on next use. */
	reset: () => void;
}

export function createSshTunnel(config: SshTunnelConfig): SshTunnel {
	const connectionLimit = config.connectionLimit ?? 4;
	let state: Promise<BuiltTunnel> | null = null;
	let current: BuiltTunnel | null = null;

	function connectSsh(): Promise<Client> {
		const cfg = config.ssh();
		return new Promise<Client>((resolve, reject) => {
			const client = new Client();
			const onError = (err: Error) => {
				reject(new Error(`SSH connection failed: ${err.message}`));
			};
			client.once("ready", () => {
				client.removeListener("error", onError);
				resolve(client);
			});
			client.once("error", onError);
			client.connect({
				host: cfg.host,
				port: cfg.port,
				username: cfg.username,
				password: cfg.password,
				readyTimeout: 15000,
				// Keep the tunnel alive across idle periods and detect dead peers.
				keepaliveInterval: 15000,
				keepaliveCountMax: 3,
			});
		});
	}

	async function build(): Promise<BuiltTunnel> {
		const ssh = await connectSsh();

		// Localhost forwarder: each inbound socket from the mysql2 pool is piped
		// through an SSH-forwarded channel to the remote MySQL (127.0.0.1:3306
		// on the remote host).
		const server = net.createServer((socket) => {
			socket.on("error", () => socket.destroy());
			// Guard against forwardOut never calling back (stalled SSH channel):
			// if it does not resolve quickly, drop the socket so the waiting
			// mysql2 connection fails fast instead of hanging forever.
			const guard = setTimeout(() => socket.destroy(), 12000);
			ssh.forwardOut("127.0.0.1", 0, "127.0.0.1", 3306, (err, stream) => {
				clearTimeout(guard);
				if (err) {
					socket.destroy();
					return;
				}
				stream.on("error", () => socket.destroy());
				socket.pipe(stream).pipe(socket);
			});
		});
		server.on("error", () => {});
		await new Promise<void>((resolve, reject) => {
			server.once("error", reject);
			server.listen(0, "127.0.0.1", () => resolve());
		});
		const localPort = (server.address() as net.AddressInfo).port;

		const db = config.db();
		const pool = mysql.createPool({
			host: "127.0.0.1",
			port: localPort,
			user: db.user,
			password: db.password,
			database: db.database,
			charset: "utf8mb4",
			// Legacy servers store naive Beirut-local datetimes; receive them as
			// raw strings (callers parse under TZ=Asia/Beirut) instead of mysql2's
			// default UTC coercion. Must match the previous per-call behaviour.
			dateStrings: true,
			connectionLimit,
			waitForConnections: true,
			maxIdle: 2,
			idleTimeout: 60000,
			enableKeepAlive: true,
			// Bound the per-connection handshake so a stalled forwarded channel
			// surfaces as an error (→ transient → reset + retry) rather than an
			// unbounded wait on pool.getConnection().
			connectTimeout: 15000,
		});

		// Keep the tunnel warm: a trivial query on an interval prevents the
		// remote SSH/MySQL from idle-dropping the connection, so the first call
		// after a quiet period doesn't pay a full ~2s reconnect. unref() so the
		// timer never holds the process open.
		const keepalive = setInterval(() => {
			pool.query("SELECT 1").catch(() => {});
		}, 30000);
		keepalive.unref();

		let torn = false;
		const built: BuiltTunnel = {
			ssh,
			server,
			pool,
			teardown: () => {
				if (torn) {
					return;
				}
				torn = true;
				clearInterval(keepalive);
				if (current === built) {
					current = null;
					state = null;
				}
				pool.end().catch(() => {});
				server.close();
				ssh.end();
			},
		};
		// If the SSH layer drops, tear the whole tunnel down so it rebuilds lazily.
		ssh.on("close", built.teardown);
		ssh.on("error", built.teardown);
		return built;
	}

	function get(): Promise<BuiltTunnel> {
		if (!state) {
			state = build()
				.then((built) => {
					current = built;
					return built;
				})
				.catch((err) => {
					state = null;
					throw err;
				});
		}
		return state;
	}

	function reset(): void {
		current?.teardown();
		current = null;
		state = null;
	}

	async function leaseOnce<T>(
		fn: (connection: Connection) => Promise<T>,
	): Promise<T> {
		const { pool } = await get();
		const conn: PoolConnection = await pool.getConnection();
		try {
			return await fn(conn);
		} finally {
			conn.release();
		}
	}

	async function withConnection<T>(
		fn: (connection: Connection) => Promise<T>,
	): Promise<T> {
		try {
			return await leaseOnce(fn);
		} catch (err) {
			if (isTransientConnError(err)) {
				reset();
				return await leaseOnce(fn);
			}
			throw err;
		}
	}

	async function leaseManyOnce<T>(
		size: number,
		fn: (connections: Connection[]) => Promise<T>,
	): Promise<T> {
		const { pool } = await get();
		const conns = await Promise.all(
			Array.from({ length: size }, () => pool.getConnection()),
		);
		try {
			return await fn(conns);
		} finally {
			for (const c of conns) {
				c.release();
			}
		}
	}

	async function withConnections<T>(
		size: number,
		fn: (connections: Connection[]) => Promise<T>,
	): Promise<T> {
		try {
			return await leaseManyOnce(size, fn);
		} catch (err) {
			if (isTransientConnError(err)) {
				reset();
				return await leaseManyOnce(size, fn);
			}
			throw err;
		}
	}

	async function getSshClient(): Promise<Client> {
		return (await get()).ssh;
	}

	return { withConnection, withConnections, getSshClient, reset };
}
