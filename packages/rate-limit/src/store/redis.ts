import type { RateLimitResult, RateLimitStore } from "../types";

/**
 * Redis client interface - minimal interface to avoid tight coupling
 * Compatible with ioredis
 *
 * Note: ioredis eval signature is: eval(script, numkeys, ...keysAndArgs)
 * We use the variadic form for maximum compatibility.
 */
interface RedisClient {
	eval(
		script: string,
		numkeys: number,
		...keysAndArgs: (string | number)[]
	): Promise<unknown>;
	get(key: string): Promise<string | null>;
	del(key: string): Promise<number>;
}

// Lua script for atomic increment with sliding window
const INCREMENT_SCRIPT = `
local key = KEYS[1]
local window = tonumber(ARGV[1])
local max = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local data = redis.call('GET', key)
local count = 0
local startTime = now

if data then
  local parts = {}
  for part in string.gmatch(data, "[^:]+") do
    table.insert(parts, part)
  end
  local storedStartTime = tonumber(parts[1])
  local storedCount = tonumber(parts[2])

  if now - storedStartTime < window then
    startTime = storedStartTime
    count = storedCount
  end
end

count = count + 1
redis.call('SET', key, startTime .. ':' .. count, 'PX', window)

local resetAt = startTime + window
local remaining = math.max(0, max - count)
local allowed = count <= max and 1 or 0
local retryAfter = allowed == 1 and 0 or math.ceil((resetAt - now) / 1000)

return {allowed, remaining, max, resetAt, retryAfter}
`;

/**
 * Redis rate limit store using sliding window algorithm
 * Suitable for distributed deployments
 */
export class RedisStore implements RateLimitStore {
	private client: RedisClient;
	private keyPrefix: string;

	constructor(client: RedisClient, keyPrefix = "rate_limit:") {
		this.client = client;
		this.keyPrefix = keyPrefix;
	}

	private getKey(key: string): string {
		return `${this.keyPrefix}${key}`;
	}

	async increment(
		key: string,
		window: number,
		max: number,
	): Promise<RateLimitResult> {
		const now = Date.now();
		const redisKey = this.getKey(key);

		// ioredis eval: eval(script, numkeys, key1, key2, ..., arg1, arg2, ...)
		const result = (await this.client.eval(
			INCREMENT_SCRIPT,
			1, // number of keys
			redisKey, // KEYS[1]
			window, // ARGV[1]
			max, // ARGV[2]
			now, // ARGV[3]
		)) as [number, number, number, number, number];

		return {
			allowed: result[0] === 1,
			remaining: result[1],
			limit: result[2],
			resetAt: result[3],
			retryAfter: result[4],
		};
	}

	async reset(key: string): Promise<void> {
		await this.client.del(this.getKey(key));
	}

	async get(
		key: string,
		window: number,
		max: number,
	): Promise<RateLimitResult> {
		const now = Date.now();
		const redisKey = this.getKey(key);
		const data = await this.client.get(redisKey);

		if (!data) {
			return {
				allowed: true,
				remaining: max,
				limit: max,
				resetAt: now + window,
				retryAfter: 0,
			};
		}

		const parts = data.split(":") as [string, string];
		const startTime = Number.parseInt(parts[0], 10);
		const count = Number.parseInt(parts[1], 10);

		// Check if window has expired
		if (now - startTime >= window) {
			return {
				allowed: true,
				remaining: max,
				limit: max,
				resetAt: now + window,
				retryAfter: 0,
			};
		}

		const resetAt = startTime + window;
		const retryAfter = Math.ceil((resetAt - now) / 1000);
		const remaining = Math.max(0, max - count);
		// Use < because get() doesn't increment - it predicts if NEXT request would succeed
		// Lua script increments first (count+1), then checks (count+1) <= max, which equals count < max
		const allowed = count < max;

		return {
			allowed,
			remaining,
			limit: max,
			resetAt,
			retryAfter: allowed ? 0 : retryAfter,
		};
	}
}

// Factory function for creating Redis store
export function createRedisStore(
	client: RedisClient,
	keyPrefix?: string,
): RedisStore {
	return new RedisStore(client, keyPrefix);
}
