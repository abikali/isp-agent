import {
	execIRadiusShell,
	queryIRadius,
	withIRadiusConnection,
} from "@repo/database/iradius";
import { logger } from "@repo/logs";

/**
 * Best-effort fallback that disconnects a customer's live PPP session on the
 * NAS by calling the MikroTik RouterOS API from the iRadius host. Used after
 * the buggy iRadius `/api/activate-user` and `/api/change-account-type`
 * endpoints succeed at the DB write but fail to actually kick the session
 * (see investigation notes — both DAO disconnect paths have bugs that go
 * unhandled). Never throws: callers should treat this as advisory.
 *
 * Why this path: CoA/RFC-5176 is not enabled on the NAS routers (radclient to
 * port 1700/3799 times out from iRadius). The only working disconnect
 * mechanism is the RouterOS API on port 8728 — which is reachable from
 * iRadius but not from our app server (NAS IPs are private). So we pipe a
 * small Python 2 MikroTik API client to `python -` over the existing SSH
 * connection, and the iRadius host fans out to the NAS.
 */

export type DisconnectResultCode =
	| "OK"
	| "NOSESSION"
	| "NOT_LINKED"
	| "NO_NAS_INFO"
	| "EXEC_FAILED"
	| "LOGIN_FAILED"
	| "PROTOCOL_ERROR";

export interface DisconnectResult {
	attempted: boolean;
	result: DisconnectResultCode;
	message?: string;
	removedCount?: number;
	nasHost?: string;
}

interface NasInfoRow {
	Host: string | null;
	ApiPort: number | null;
	ApiUserName: string | null;
	ApiPassword: string | null;
	MikrotikUser: string | null;
	UserName: string | null;
}

// Embedded Python 2.7 MikroTik RouterOS API client. Streamed to iRadius via
// SSH stdin each call — no file is deployed. Prints exactly one RESULT_* line
// on stdout as the last line; everything else is debug noise.
const PYTHON_MIKROTIK_DISCONNECT = `from __future__ import print_function
import socket, sys
def enc_len(l):
    if l < 0x80: return chr(l)
    if l < 0x4000: return chr((l >> 8) | 0x80) + chr(l & 0xFF)
    if l < 0x200000: return chr((l >> 16) | 0xC0) + chr((l >> 8) & 0xFF) + chr(l & 0xFF)
    if l < 0x10000000: return chr((l >> 24) | 0xE0) + chr((l >> 16) & 0xFF) + chr((l >> 8) & 0xFF) + chr(l & 0xFF)
    return chr(0xF0) + chr((l >> 24) & 0xFF) + chr((l >> 16) & 0xFF) + chr((l >> 8) & 0xFF) + chr(l & 0xFF)
def write_word(s, w):
    if isinstance(w, unicode): w = w.encode('utf-8')
    s.sendall(enc_len(len(w)) + w)
def write_sentence(s, words):
    for w in words: write_word(s, w)
    write_word(s, '')
def read_length(s):
    b = ord(s.recv(1))
    if (b & 0x80) == 0: return b
    if (b & 0xC0) == 0x80: return ((b & 0x3F) << 8) | ord(s.recv(1))
    if (b & 0xE0) == 0xC0: return ((b & 0x1F) << 16) | (ord(s.recv(1)) << 8) | ord(s.recv(1))
    if (b & 0xF0) == 0xE0: return ((b & 0x0F) << 24) | (ord(s.recv(1)) << 16) | (ord(s.recv(1)) << 8) | ord(s.recv(1))
    return (ord(s.recv(1)) << 24) | (ord(s.recv(1)) << 16) | (ord(s.recv(1)) << 8) | ord(s.recv(1))
def read_word(s):
    l = read_length(s)
    if l == 0: return ''
    data = b''
    while len(data) < l:
        chunk = s.recv(l - len(data))
        if not chunk: raise IOError('connection closed mid-word')
        data += chunk
    return data
def read_sentence(s):
    out = []
    while True:
        w = read_word(s)
        if w == '': break
        out.append(w)
    return out
def main():
    if len(sys.argv) < 6:
        print('RESULT_ERR usage: host port user passwd target')
        sys.exit(1)
    host = sys.argv[1]; port = int(sys.argv[2]); user = sys.argv[3]; passwd = sys.argv[4]; target = sys.argv[5]
    try:
        s = socket.socket(); s.settimeout(8); s.connect((host, port))
    except Exception as e:
        print('RESULT_EXEC_FAILED connect: ' + str(e)); sys.exit(1)
    try:
        write_sentence(s, ['/login', '=name=' + user, '=password=' + passwd])
        while True:
            sent = read_sentence(s)
            if not sent: break
            if sent[0] == '!done': break
            if sent[0] == '!trap':
                print('RESULT_LOGIN_FAILED ' + ' '.join(sent[1:])); sys.exit(1)
        write_sentence(s, ['/ppp/active/print', '?name=' + target])
        ids = []
        while True:
            sent = read_sentence(s)
            if not sent: break
            if sent[0] == '!re':
                for w in sent[1:]:
                    if w.startswith('=.id='):
                        ids.append(w[5:])
            elif sent[0] == '!done': break
            elif sent[0] == '!trap':
                print('RESULT_PROTOCOL_ERROR probe: ' + ' '.join(sent[1:])); sys.exit(1)
        if not ids:
            print('RESULT_NOSESSION'); sys.exit(0)
        removed = 0
        for i in ids:
            write_sentence(s, ['/ppp/active/remove', '=.id=' + i])
            while True:
                sent = read_sentence(s)
                if not sent: break
                if sent[0] == '!done':
                    removed += 1; break
                if sent[0] == '!trap':
                    print('RESULT_PROTOCOL_ERROR remove: ' + ' '.join(sent[1:])); sys.exit(1)
        print('RESULT_OK ' + str(removed)); sys.exit(0)
    finally:
        try: s.close()
        except: pass
main()
`;

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, "'\\''")}'`;
}

interface ParsedResult {
	code: DisconnectResultCode;
	message?: string;
	removedCount?: number;
}

function parseResultLine(stdout: string): ParsedResult {
	const lines = stdout
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.startsWith("RESULT_"));
	const last = lines[lines.length - 1] ?? "";
	if (last.startsWith("RESULT_OK")) {
		const n = Number.parseInt(last.slice("RESULT_OK".length).trim(), 10);
		const out: ParsedResult = { code: "OK" };
		if (Number.isFinite(n)) {
			out.removedCount = n;
		}
		return out;
	}
	if (last.startsWith("RESULT_NOSESSION")) {
		return { code: "NOSESSION" };
	}
	const errorPrefixes: Array<[string, DisconnectResultCode]> = [
		["RESULT_LOGIN_FAILED", "LOGIN_FAILED"],
		["RESULT_PROTOCOL_ERROR", "PROTOCOL_ERROR"],
		["RESULT_EXEC_FAILED", "EXEC_FAILED"],
	];
	for (const [prefix, code] of errorPrefixes) {
		if (last.startsWith(prefix)) {
			const message = last.slice(prefix.length).trim();
			const out: ParsedResult = { code };
			if (message) {
				out.message = message;
			}
			return out;
		}
	}
	return { code: "EXEC_FAILED", message: "no RESULT_ line in stdout" };
}

export async function iradiusForceDisconnect(input: {
	externalId: string | null;
}): Promise<DisconnectResult> {
	if (!input.externalId) {
		return { attempted: false, result: "NOT_LINKED" };
	}
	const userId = Number.parseInt(input.externalId, 10);
	if (!Number.isFinite(userId) || userId <= 0) {
		return { attempted: false, result: "NOT_LINKED" };
	}

	try {
		const rows = (await withIRadiusConnection((conn) =>
			queryIRadius(
				conn,
				`SELECT Nas.Host, Nas.ApiPort, Nas.ApiUserName, Nas.ApiPassword,
				        UserNas.MikrotikUser, User.UserName
				 FROM UserNas
				 LEFT JOIN User ON User.Id = UserNas.UserId
				 LEFT JOIN Nas ON Nas.Host = UserNas.NasHost
				 WHERE UserNas.UserId = ?`,
				[userId],
			),
		)) as unknown as NasInfoRow[];

		const row = rows[0];
		if (
			!row?.Host ||
			!row.ApiUserName ||
			!row.ApiPassword ||
			(!row.MikrotikUser && !row.UserName)
		) {
			return { attempted: false, result: "NO_NAS_INFO" };
		}
		const targetUser = row.MikrotikUser || row.UserName;
		if (!targetUser) {
			return { attempted: false, result: "NO_NAS_INFO" };
		}
		const port = row.ApiPort ?? 8728;

		const args = [
			row.Host,
			String(port),
			row.ApiUserName,
			row.ApiPassword,
			targetUser,
		]
			.map(shellQuote)
			.join(" ");

		const exec = await execIRadiusShell(`python - ${args}`, {
			stdin: PYTHON_MIKROTIK_DISCONNECT,
			timeoutMs: 15_000,
		});

		const parsed = parseResultLine(exec.stdout);

		if (parsed.code === "OK" || parsed.code === "NOSESSION") {
			logger.info("iRadius force-disconnect", {
				userId,
				nasHost: row.Host,
				targetUser,
				result: parsed.code,
				removedCount: parsed.removedCount,
			});
		} else {
			logger.warn("iRadius force-disconnect did not complete", {
				userId,
				nasHost: row.Host,
				targetUser,
				result: parsed.code,
				message: parsed.message,
				exitCode: exec.exitCode,
				stderr: exec.stderr.slice(0, 500),
			});
		}

		return {
			attempted: true,
			result: parsed.code,
			...(parsed.message !== undefined && { message: parsed.message }),
			...(parsed.removedCount !== undefined && {
				removedCount: parsed.removedCount,
			}),
			nasHost: row.Host,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.warn("iRadius force-disconnect threw", { userId, message });
		return {
			attempted: true,
			result: "EXEC_FAILED",
			message,
		};
	}
}
