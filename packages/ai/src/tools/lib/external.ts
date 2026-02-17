import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export interface TracerouteInstance {
	on(event: string, cb: (...args: unknown[]) => void): void;
	trace(host: string): void;
}

interface TracerouteConstructor {
	new (): TracerouteInstance;
}

export function loadTraceroute(): TracerouteConstructor {
	return require("nodejs-traceroute") as TracerouteConstructor;
}

export interface SpeedTestResult {
	download: { bandwidth: number };
	upload: { bandwidth: number };
	ping: { latency: number };
	server: { name: string; location: string };
}

type SpeedTestFn = (
	options?: Record<string, unknown>,
) => Promise<SpeedTestResult>;

export function loadSpeedTest(): SpeedTestFn {
	return require("speedtest-net") as SpeedTestFn;
}
