import { beforeEach, describe, expect, it, vi } from "vitest";
import * as ispApi from "../lib/isp-api-client";

vi.mock("../lib/isp-api-client", async (importOriginal) => {
	const mod = await importOriginal<typeof import("../lib/isp-api-client")>();
	return {
		...mod,
		lookupCustomerByContactPhone: vi.fn(),
	};
});

const baseContext = {
	organizationId: "org",
	agentId: "agent",
	conversationId: "conv",
	externalChatId: "chat",
};

describe("makeIspCustomerLookup (per-turn memoizer)", () => {
	beforeEach(() => {
		vi.mocked(ispApi.lookupCustomerByContactPhone).mockReset();
		process.env["ISP_API_BASE_URL"] = "http://test.local/api";
		process.env["ISP_API_USERNAME"] = "u";
		process.env["ISP_API_PASSWORD"] = "p";
	});

	it("calls lookupCustomerByContactPhone at most once across multiple invocations", async () => {
		vi.mocked(ispApi.lookupCustomerByContactPhone).mockResolvedValue({
			userName: "alice",
		});
		const { makeIspCustomerLookup } = await import("..");
		const lookup = makeIspCustomerLookup(
			{ ...baseContext, contactPhone: "70442737" },
			undefined,
		);

		const [a, b, c] = await Promise.all([lookup(), lookup(), lookup()]);

		expect(a).toEqual({ userName: "alice" });
		expect(b).toBe(a);
		expect(c).toBe(a);
		expect(ispApi.lookupCustomerByContactPhone).toHaveBeenCalledTimes(1);
	});

	it("returns null without calling the API when contactPhone is missing", async () => {
		const { makeIspCustomerLookup } = await import("..");
		const lookup = makeIspCustomerLookup(baseContext, undefined);

		expect(await lookup()).toBeNull();
		expect(ispApi.lookupCustomerByContactPhone).not.toHaveBeenCalled();
	});

	it("returns null when ISP API is not configured (no env, no toolConfig)", async () => {
		delete process.env["ISP_API_BASE_URL"];
		delete process.env["ISP_API_USERNAME"];
		delete process.env["ISP_API_PASSWORD"];
		const { makeIspCustomerLookup } = await import("..");
		const lookup = makeIspCustomerLookup(
			{ ...baseContext, contactPhone: "70442737" },
			undefined,
		);

		expect(await lookup()).toBeNull();
		expect(ispApi.lookupCustomerByContactPhone).not.toHaveBeenCalled();
	});

	it("uses ispToolConfig credentials when provided", async () => {
		// Drop env so the only way to get credentials is via toolConfig.
		delete process.env["ISP_API_BASE_URL"];
		delete process.env["ISP_API_USERNAME"];
		delete process.env["ISP_API_PASSWORD"];
		vi.mocked(ispApi.lookupCustomerByContactPhone).mockResolvedValue({
			userName: "bob",
		});
		const { makeIspCustomerLookup } = await import("..");
		const lookup = makeIspCustomerLookup(
			{ ...baseContext, contactPhone: "70442737" },
			{
				ispBaseUrl: "http://from-tool-config.local/api",
				ispUsername: "tc_user",
				ispPassword: "tc_pass",
			},
		);

		const result = await lookup();
		expect(result).toEqual({ userName: "bob" });
		expect(ispApi.lookupCustomerByContactPhone).toHaveBeenCalledTimes(1);
		const firstCall = vi.mocked(ispApi.lookupCustomerByContactPhone).mock
			.calls[0];
		expect(firstCall).toBeDefined();
		const calledConfig = firstCall?.[0];
		expect(calledConfig?.baseUrl).toBe("http://from-tool-config.local/api");
		expect(calledConfig?.userName).toBe("tc_user");
	});

	it("caches even when the underlying lookup throws (no retry storm)", async () => {
		vi.mocked(ispApi.lookupCustomerByContactPhone).mockRejectedValue(
			new Error("API down"),
		);
		const { makeIspCustomerLookup } = await import("..");
		const lookup = makeIspCustomerLookup(
			{ ...baseContext, contactPhone: "70442737" },
			undefined,
		);

		await expect(lookup()).rejects.toThrow("API down");
		await expect(lookup()).rejects.toThrow("API down");
		// The promise is cached so the second await re-uses the rejection
		// without firing the network call again.
		expect(ispApi.lookupCustomerByContactPhone).toHaveBeenCalledTimes(1);
	});
});
